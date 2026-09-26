<!--
  The shadcn theme's widget (spec §3.8, §3.9 layer 3): launcher plus window over the headless
  `createChat` store. `floating` places both at a corner, `inline` renders the window in the flow
  for a docs column, `sheet` opens a shadcn Sheet on the launcher's side.
-->
<script lang="ts">
	import './styles.css';
	import type { Snippet } from 'svelte';
	import { untrack } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import type { Strings } from '../../shared/strings';
	import type { Suggestions, Usage } from '../../shared/types';
	import {
		createChat,
		type ChatStore,
		type WidgetMode,
		type WidgetPosition
	} from '../../headless/create-chat.svelte';
	import { trapFocus } from '../../headless/focus-trap';
	import ChatLauncher from './ChatLauncher.svelte';
	import ChatPanel from './ChatPanel.svelte';
	import ChatWindow from './ChatWindow.svelte';
	import * as Sheet from './ui/sheet/index.js';
	import { cn } from './utils.js';

	let {
		endpoint,
		position = 'bottom-right',
		offset,
		mode = 'floating',
		open = $bindable(false),
		enabled = true,
		suggestions,
		strings,
		disclosure,
		persistThread = true,
		answerLinks = 'same-origin',
		onopen,
		onclose,
		onsend,
		onresponse,
		onerror,
		fetch: fetchImpl,
		chat: external,
		launcher,
		class: className
	}: {
		endpoint?: string;
		position?: WidgetPosition;
		offset?: { x?: number | string; y?: number | string };
		mode?: WidgetMode;
		open?: boolean;
		enabled?: boolean;
		suggestions?: Suggestions;
		strings?: Partial<Strings>;
		disclosure?: string;
		persistThread?: boolean;
		answerLinks?: 'same-origin' | 'any';
		onopen?: () => void;
		onclose?: () => void;
		onsend?: (text: string) => void;
		onresponse?: (text: string, usage?: Usage) => void;
		onerror?: (code: string) => void;
		fetch?: typeof fetch;
		/** A store made with `createChat`; the options above are then ignored. */
		chat?: ChatStore;
		/** Replaces the default launcher; `position` is then ignored. */
		launcher?: Snippet<[{ open: boolean; toggle: () => void }]>;
		class?: string;
	} = $props();

	const chat: ChatStore = untrack(
		() =>
			external ??
			createChat({
				endpoint,
				persistThread,
				answerLinks,
				strings,
				suggestions,
				fetch: fetchImpl,
				onopen: () => onopen?.(),
				onclose: () => onclose?.(),
				onsend: (text) => onsend?.(text),
				onresponse: (text, usage) => onresponse?.(text, usage),
				onerror: (code) => onerror?.(code)
			})
	);

	const uid = $props.id();
	const windowId = `aide-window-${uid}`;
	const titleId = `aide-title-${uid}`;
	const inline = $derived(mode === 'inline');

	// open prop -> store
	$effect(() => {
		const want = open;
		untrack(() => {
			if (!enabled) return;
			if (want && !chat.isOpen) chat.open();
			else if (!want && chat.isOpen) chat.close();
		});
	});
	// store -> open prop
	$effect(() => {
		const isOpen = chat.isOpen;
		untrack(() => {
			if (open !== isOpen) open = isOpen;
		});
	});

	afterNavigate(({ to }) => {
		const path = to?.url.pathname;
		if (path && enabled && (chat.isOpen || inline)) void chat.warmup(path);
	});

	const fmt = (v: number | string | undefined): string | undefined =>
		v === undefined ? undefined : typeof v === 'number' ? `${v}px` : v;

	const top = $derived(position.startsWith('top'));
	const left = $derived(position.endsWith('left'));

	// Offsets come in as custom properties so every placement is a static, prefixed class.
	const launcherPlace = $derived(
		cn(
			'aide:fixed aide:z-50',
			top ? 'aide:top-[var(--aide-offset-y,1.25rem)]' : 'aide:bottom-[var(--aide-offset-y,1.25rem)]',
			left ? 'aide:left-[var(--aide-offset-x,1.25rem)]' : 'aide:right-[var(--aide-offset-x,1.25rem)]'
		)
	);
	const windowPlace = $derived(
		launcher
			? 'aide:right-[var(--aide-offset-x,1.25rem)] aide:bottom-[var(--aide-offset-y,1.25rem)] aide:origin-bottom-right'
			: cn(
					top
						? 'aide:top-[calc(var(--aide-offset-y,1.25rem)+4.5rem)]'
						: 'aide:bottom-[calc(var(--aide-offset-y,1.25rem)+4.5rem)]',
					left ? 'aide:left-[var(--aide-offset-x,1.25rem)]' : 'aide:right-[var(--aide-offset-x,1.25rem)]',
					top ? (left ? 'aide:origin-top-left' : 'aide:origin-top-right') : left ? 'aide:origin-bottom-left' : 'aide:origin-bottom-right'
				)
	);
	const floatingWindow = $derived(
		cn(
			'aide:fixed aide:z-50 aide:h-[min(40rem,calc(100dvh-7.5rem))] aide:w-[25rem] aide:max-w-[calc(100vw-16px)] aide:rounded-2xl aide:shadow-2xl aide:motion-safe:animate-pop',
			windowPlace,
			// Full-screen on small viewports (spec §3.8).
			'aide:max-[480px]:inset-0 aide:max-[480px]:h-full aide:max-[480px]:w-full aide:max-[480px]:max-w-none aide:max-[480px]:rounded-none aide:max-[480px]:border-0'
		)
	);
</script>

{#if enabled}
	<div
		data-aide-ignore
		data-aide-theme="shadcn"
		data-part="widget"
		data-position={launcher ? undefined : position}
		data-mode={mode}
		data-open={chat.isOpen ? '' : undefined}
		class={cn(inline ? 'aide:block aide:h-full aide:min-h-0' : 'aide:contents', className)}
		style:--aide-offset-x={fmt(offset?.x)}
		style:--aide-offset-y={fmt(offset?.y)}
	>
		{#if !inline}
			{#if launcher}
				{@render launcher({ open: chat.isOpen, toggle: chat.toggle })}
			{:else}
				<ChatLauncher {chat} controls={windowId} {position} class={launcherPlace} />
			{/if}
		{/if}
		{#if inline}
			<ChatWindow {chat} id={windowId} modal={false} {disclosure} class="aide:h-full aide:min-h-96 aide:w-full" />
		{:else if mode === 'sheet'}
			<Sheet.Root open={chat.isOpen} onOpenChange={(value) => (value ? chat.open() : chat.close())}>
				<Sheet.Content
					id={windowId}
					data-aide-ignore
					data-aide-theme="shadcn"
					data-part="window"
					data-modal=""
					side={left ? 'left' : 'right'}
					showCloseButton={false}
					trapFocus={false}
					onOpenAutoFocus={(event) => event.preventDefault()}
					onCloseAutoFocus={(event) => event.preventDefault()}
					class={cn(
						'aide:gap-0 aide:bg-background aide:p-0 aide:text-foreground aide:shadow-2xl',
						'aide:data-[side=left]:w-full aide:data-[side=right]:w-full aide:data-[side=left]:sm:max-w-md aide:data-[side=right]:sm:max-w-md',
						left ? 'aide:motion-safe:animate-slide-in-left' : 'aide:motion-safe:animate-slide-in-right'
					)}
				>
					<div
						class="aide:flex aide:h-full aide:min-h-0 aide:flex-col"
						use:trapFocus={{ initial: '[data-part="input"]' }}
					>
						<ChatPanel {chat} {titleId} sheet {disclosure} />
					</div>
				</Sheet.Content>
			</Sheet.Root>
		{:else if chat.isOpen}
			<ChatWindow {chat} id={windowId} {disclosure} class={floatingWindow} />
		{/if}
	</div>
{/if}
