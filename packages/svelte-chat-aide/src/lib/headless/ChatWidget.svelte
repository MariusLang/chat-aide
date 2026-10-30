<!--
  Launcher plus window, unstyled (spec §3.8, §3.9 layer 1). Structure only: every element
  carries a `data-part`; `position`, `offset` and `mode` are exposed as data attributes and
  custom properties for a theme to place.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { untrack } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import type { Strings } from '@chat-aide/core/client';
	import type { Suggestions, Usage } from '@chat-aide/core/client';
	import { createChat, type ChatStore, type WidgetMode, type WidgetPosition } from './create-chat.svelte.js';
	import ChatLauncher from './ChatLauncher.svelte';
	import ChatWindow from './ChatWindow.svelte';

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
	const inline = $derived(mode === 'inline');
	const shown = $derived(inline || chat.isOpen);

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
</script>

{#if enabled}
	<div
		data-aide-ignore
		data-part="widget"
		data-position={launcher ? undefined : position}
		data-mode={mode}
		data-open={chat.isOpen ? '' : undefined}
		class={className}
		style:--aide-offset-x={fmt(offset?.x)}
		style:--aide-offset-y={fmt(offset?.y)}
	>
		{#if !inline}
			{#if launcher}
				{@render launcher({ open: chat.isOpen, toggle: chat.toggle })}
			{:else}
				<ChatLauncher {chat} controls={windowId} />
			{/if}
		{/if}
		{#if shown}
			<ChatWindow {chat} id={windowId} modal={!inline} {disclosure} />
		{/if}
	</div>
{/if}
