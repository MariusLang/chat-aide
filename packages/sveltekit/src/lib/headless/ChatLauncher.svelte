<!-- The floating button that opens the chat (spec §3.8). -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ChatStore } from './create-chat.svelte.js';

	let {
		chat,
		controls,
		class: className,
		children
	}: {
		chat: ChatStore;
		/** The id of the window this button opens. */
		controls?: string;
		class?: string;
		/** The button's visible content (default: the `open` string). */
		children?: Snippet;
	} = $props();
</script>

<button
	type="button"
	data-part="launcher"
	aria-label={chat.strings.open}
	aria-expanded={chat.isOpen}
	aria-controls={controls}
	aria-haspopup="dialog"
	class={className}
	onclick={() => chat.toggle()}
>
	{#if children}{@render children()}{:else}{chat.strings.open}{/if}
</button>
