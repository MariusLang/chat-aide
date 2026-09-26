<!--
  The conversation (spec §3.8): greeting and suggestions when empty, the messages, the error
  with a retry, and a status node that receives each finished answer once for screen readers.
-->
<script lang="ts">
	import type { ChatStore } from './create-chat.svelte';
	import { messageText } from './create-chat.svelte';
	import Message from './Message.svelte';

	let { chat, class: className }: { chat: ChatStore; class?: string } = $props();

	const visible = $derived(chat.messages.filter((m) => m.role === 'user' || m.role === 'assistant'));
	const busy = $derived(chat.status === 'submitted' || chat.status === 'streaming');

	let announcement = $state('');
	let previous: string | undefined;
	$effect(() => {
		const status = chat.status;
		if (previous === 'streaming' && status === 'ready') {
			const last = chat.messages.at(-1);
			if (last?.role === 'assistant') announcement = messageText(last);
		}
		previous = status;
	});

	let node: HTMLElement | undefined = $state();
	$effect(() => {
		// Follow the newest text while it streams.
		void chat.messages.length;
		void (chat.messages.at(-1)?.parts.length ?? 0);
		if (node && typeof node.scrollTo === 'function') node.scrollTo({ top: node.scrollHeight });
	});
</script>

<div data-part="transcript" aria-live="polite" class={className} bind:this={node}>
	{#if visible.length === 0}
		<p data-part="greeting">{chat.strings.greeting}</p>
		{#if chat.suggestions.length}
			<ul data-part="suggestions">
				{#each chat.suggestions as suggestion (suggestion)}
					<li>
						<button type="button" data-part="suggestion" onclick={() => chat.send(suggestion)}
							>{suggestion}</button
						>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
	{#each visible as message, i (message.id)}
		<Message
			{message}
			streaming={busy && i === visible.length - 1 && message.role === 'assistant'}
			answerLinks={chat.answerLinks}
			strings={chat.strings}
		/>
	{/each}
	{#if chat.status === 'submitted'}
		<div data-part="pending" aria-hidden="true"></div>
	{/if}
	{#if chat.error}
		<div data-part="error" role="alert" data-code={chat.error.code}>
			<p>{chat.error.message}</p>
			<button type="button" data-part="retry" onclick={() => chat.retry()}>{chat.strings.retry}</button>
		</div>
	{/if}
</div>
<div data-part="status" role="status" aria-live="polite">{announcement}</div>
