<!--
  The chat window (spec §3.8): header, transcript, composer and disclosure. As a modal dialog it
  traps focus and closes on Escape, returning focus to the launcher; with `modal={false}` it is
  a plain region for an inline docs column.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ChatStore } from './create-chat.svelte';
	import Composer from './Composer.svelte';
	import Transcript from './Transcript.svelte';
	import { trapFocus } from './focus-trap';

	let {
		chat,
		id,
		modal = true,
		disclosure,
		class: className,
		header,
		footer
	}: {
		chat: ChatStore;
		/** The window's id (the launcher's `aria-controls`). */
		id?: string;
		modal?: boolean;
		/** The line under the composer saying where messages go. */
		disclosure?: string;
		class?: string;
		/** Replaces the default header. */
		header?: Snippet<[{ close: () => void; titleId: string }]>;
		/** Extra content after the disclosure. */
		footer?: Snippet;
	} = $props();

	const uid = $props.id();
	const windowId = $derived(id ?? `aide-window-${uid}`);
	const titleId = `aide-title-${uid}`;
	const line = $derived(disclosure ?? chat.strings.disclosure(chat.provider ?? "the site's AI provider"));

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
	data-part="window"
	data-modal={modal ? '' : undefined}
	role={modal ? 'dialog' : 'region'}
	aria-modal={modal ? 'true' : undefined}
	aria-labelledby={titleId}
	class={className}
	{onkeydown}
	use:trapFocus={{ enabled: modal, initial: '[data-part="input"]' }}
>
	{#if header}
		{@render header({ close: chat.close, titleId })}
	{:else}
		<header data-part="header">
			<h2 data-part="title" id={titleId}>{chat.strings.title}</h2>
			{#if modal}
				<button type="button" data-part="close" aria-label={chat.strings.close} onclick={() => chat.close()}
					>×</button
				>
			{/if}
		</header>
	{/if}
	<Transcript {chat} />
	<Composer {chat} />
	{#if line}
		<p data-part="disclosure">{line}</p>
	{/if}
	{@render footer?.()}
</section>
