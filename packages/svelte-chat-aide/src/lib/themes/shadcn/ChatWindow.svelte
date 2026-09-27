<!--
  The shadcn theme's chat window (spec §3.8, §3.9 layer 3). As a modal dialog it traps focus with
  the headless `trapFocus`, closes on Escape and returns focus to the launcher; with
  `modal={false}` it is a region for an inline docs column and can be mounted on its own.
-->
<script lang="ts">
	import './styles.css';
	import type { ChatStore } from '../../headless/create-chat.svelte.js';
	import { trapFocus } from '../../headless/focus-trap.js';
	import ChatPanel from './ChatPanel.svelte';
	import { cn } from './utils.js';

	let {
		chat,
		id,
		modal = true,
		disclosure,
		class: className
	}: {
		chat: ChatStore;
		/** The window's id (the launcher's `aria-controls`). */
		id?: string;
		modal?: boolean;
		/** The line under the composer saying where messages go. */
		disclosure?: string;
		class?: string;
	} = $props();

	const uid = $props.id();
	const windowId = $derived(id ?? `aide-window-${uid}`);
	const titleId = `aide-title-${uid}`;

	function onkeydown(event: KeyboardEvent): void {
		if (modal && event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			chat.close();
		}
	}
</script>

<section
	id={windowId}
	data-aide-ignore
	data-aide-theme="shadcn"
	data-part="window"
	data-modal={modal ? '' : undefined}
	role={modal ? 'dialog' : 'region'}
	aria-modal={modal ? 'true' : undefined}
	aria-labelledby={titleId}
	class={cn(
		'aide:flex aide:min-h-0 aide:flex-col aide:overflow-hidden aide:rounded-xl aide:border aide:border-border aide:bg-background aide:text-foreground',
		className
	)}
	{onkeydown}
	use:trapFocus={{ enabled: modal, initial: '[data-part="input"]' }}
>
	<ChatPanel {chat} {titleId} closable={modal} {disclosure} />
</section>
