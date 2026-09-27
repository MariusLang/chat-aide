<!-- The message field with send and stop (spec §3.8). Enter sends, Shift+Enter adds a line. -->
<script lang="ts">
	import { LIMIT_DEFAULTS } from '../shared/limits.js';
	import type { ChatStore } from './create-chat.svelte.js';

	let {
		chat,
		class: className,
		maxlength = LIMIT_DEFAULTS.messageChars
	}: { chat: ChatStore; class?: string; maxlength?: number } = $props();

	let value = $state('');
	const busy = $derived(chat.status === 'submitted' || chat.status === 'streaming');

	function submit(event?: Event): void {
		event?.preventDefault();
		if (busy || !value.trim()) return;
		const text = value;
		value = '';
		void chat.send(text);
	}

	function onkeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) submit(event);
	}
</script>

<form data-part="composer" class={className} onsubmit={submit}>
	<textarea
		data-part="input"
		bind:value
		{onkeydown}
		{maxlength}
		rows="1"
		placeholder={chat.strings.placeholder}
		aria-label={chat.strings.placeholder}
	></textarea>
	{#if busy}
		<button type="button" data-part="stop" onclick={() => chat.stop()}>{chat.strings.stop}</button>
	{:else}
		<button type="submit" data-part="send" disabled={!value.trim()}>{chat.strings.send}</button>
	{/if}
</form>
