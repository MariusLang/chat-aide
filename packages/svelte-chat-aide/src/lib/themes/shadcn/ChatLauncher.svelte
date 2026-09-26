<!--
  The shadcn theme's floating launcher (spec §3.8): a round shadcn Button with a Tooltip, the
  same label and aria wiring as the headless launcher.
-->
<script lang="ts">
	import './styles.css';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import X from '@lucide/svelte/icons/x';
	import type { ChatStore, WidgetPosition } from '../../headless/create-chat.svelte';
	import { Button } from './ui/button/index.js';
	import * as Tooltip from './ui/tooltip/index.js';
	import { cn } from './utils.js';

	let {
		chat,
		controls,
		position = 'bottom-right',
		class: className
	}: {
		chat: ChatStore;
		/** The id of the window this button opens. */
		controls?: string;
		/** Which side the tooltip opens away from. */
		position?: WidgetPosition;
		class?: string;
	} = $props();

	const side = $derived(position.endsWith('left') ? 'right' : 'left');
</script>

<Tooltip.Provider delayDuration={300}>
	<Tooltip.Root disabled={chat.isOpen}>
		<Tooltip.Trigger
			data-part="launcher"
			aria-label={chat.strings.open}
			aria-expanded={chat.isOpen}
			aria-controls={controls}
			aria-haspopup="dialog"
			onclick={() => chat.toggle()}
		>
			{#snippet child({ props })}
				<Button
					{...props}
					size="icon-lg"
					class={cn(
						'aide:group aide:size-14 aide:rounded-full aide:shadow-lg aide:transition-[transform,box-shadow,background-color] aide:hover:shadow-xl aide:motion-safe:hover:scale-105 aide:motion-safe:active:scale-95',
						className
					)}
				>
					<span
						class="aide:relative aide:flex aide:size-6 aide:items-center aide:justify-center"
						aria-hidden="true"
					>
						<MessageCircle
							class={cn(
								'aide:absolute aide:size-6 aide:transition-[opacity,rotate,scale] aide:duration-200',
								chat.isOpen && 'aide:scale-50 aide:rotate-90 aide:opacity-0'
							)}
						/>
						<X
							class={cn(
								'aide:absolute aide:size-6 aide:transition-[opacity,rotate,scale] aide:duration-200',
								!chat.isOpen && 'aide:scale-50 aide:-rotate-90 aide:opacity-0'
							)}
						/>
					</span>
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content {side} sideOffset={8} data-aide-theme="shadcn">{chat.strings.open}</Tooltip.Content>
	</Tooltip.Root>
</Tooltip.Provider>
