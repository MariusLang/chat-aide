<!-- One message of the transcript. Visitor text stays text; answers render through Markdown. -->
<script lang="ts">
	import type { UIMessage } from 'ai';
	import { DEFAULT_STRINGS, type Strings } from '@chat-aide/core/client';
	import { messageText } from './create-chat.svelte.js';
	import Markdown from './Markdown.svelte';

	let {
		message,
		streaming = false,
		answerLinks = 'same-origin',
		strings = DEFAULT_STRINGS,
		class: className
	}: {
		message: UIMessage;
		/** True while this answer is still arriving (sets `aria-busy`). */
		streaming?: boolean;
		answerLinks?: 'same-origin' | 'any';
		strings?: Strings;
		class?: string;
	} = $props();

	const text = $derived(messageText(message));
</script>

<div
	data-part="message"
	data-role={message.role}
	data-streaming={streaming ? '' : undefined}
	aria-busy={streaming ? 'true' : undefined}
	class={className}
>
	{#if message.role === 'assistant'}
		<Markdown {text} {answerLinks} {strings} />
	{:else}
		<p data-part="message-text">{text}</p>
	{/if}
</div>
