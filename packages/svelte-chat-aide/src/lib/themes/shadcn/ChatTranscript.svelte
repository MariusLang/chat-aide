<!--
  The shadcn theme's transcript (spec §3.8): the same structure and announcements as the headless
  Transcript (greeting, suggestions, messages, pending, error with retry, a visually hidden
  status node that receives each finished answer once), inside a shadcn ScrollArea.
-->
<script lang="ts">
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import { messageText, type ChatStore } from '../../headless/create-chat.svelte';
	import Message from '../../headless/Message.svelte';
	import { Button } from './ui/button/index.js';
	import { ScrollArea } from './ui/scroll-area/index.js';
	import { cn } from './utils.js';

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

	let viewport: HTMLElement | null = $state(null);
	$effect(() => {
		// Follow the newest text while it streams.
		void chat.messages.length;
		const last = chat.messages.at(-1);
		void (last ? messageText(last).length : 0);
		if (viewport && typeof viewport.scrollTo === 'function') viewport.scrollTo({ top: viewport.scrollHeight });
	});

	const bubble = {
		user: 'aide:self-end aide:max-w-[85%] aide:rounded-2xl aide:rounded-br-md aide:bg-primary aide:px-3.5 aide:py-2 aide:text-primary-foreground aide:shadow-xs',
		assistant:
			'aide:self-start aide:max-w-[92%] aide:rounded-2xl aide:rounded-bl-md aide:bg-muted aide:px-3.5 aide:py-2 aide:text-foreground'
	};
</script>

<ScrollArea class={cn('aide:min-h-0 aide:flex-1', className)} bind:viewportRef={viewport}>
	<div
		data-part="transcript"
		aria-live="polite"
		class="aide:flex aide:min-h-full aide:flex-col aide:gap-3 aide:px-4 aide:py-4 aide:text-sm aide:leading-relaxed"
	>
		{#if visible.length === 0}
			<div
				class="aide:my-auto aide:flex aide:flex-col aide:items-center aide:gap-4 aide:px-2 aide:py-6 aide:text-center"
			>
				<span
					class="aide:flex aide:size-11 aide:items-center aide:justify-center aide:rounded-full aide:bg-muted aide:text-foreground"
					aria-hidden="true"
				>
					<Sparkles class="aide:size-5" />
				</span>
				<p data-part="greeting" class="aide:max-w-[18rem] aide:text-balance aide:text-foreground">
					{chat.strings.greeting}
				</p>
				{#if chat.suggestions.length}
					<ul data-part="suggestions" class="aide:flex aide:flex-wrap aide:justify-center aide:gap-2">
						{#each chat.suggestions as suggestion (suggestion)}
							<li>
								<Button
									variant="outline"
									size="sm"
									data-part="suggestion"
									class="aide:h-auto aide:min-h-8 aide:rounded-full aide:px-3 aide:py-1.5 aide:text-left aide:font-normal aide:whitespace-normal"
									onclick={() => chat.send(suggestion)}>{suggestion}</Button
								>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
		{#each visible as message, i (message.id)}
			<Message
				{message}
				streaming={busy && i === visible.length - 1 && message.role === 'assistant'}
				answerLinks={chat.answerLinks}
				strings={chat.strings}
				class={message.role === 'user' ? bubble.user : bubble.assistant}
			/>
		{/each}
		{#if chat.status === 'submitted'}
			<div
				data-part="pending"
				aria-hidden="true"
				class="aide:flex aide:items-center aide:gap-1 aide:self-start aide:rounded-2xl aide:rounded-bl-md aide:bg-muted aide:px-3.5 aide:py-3"
			>
				{#each [0, 1, 2] as dot (dot)}
					<span
						class="aide:size-1.5 aide:rounded-full aide:bg-muted-foreground aide:motion-safe:animate-dot"
						style:animation-delay="{dot * 160}ms"
					></span>
				{/each}
			</div>
		{/if}
		{#if chat.error}
			<div
				data-part="error"
				role="alert"
				data-code={chat.error.code}
				class="aide:flex aide:items-start aide:gap-3 aide:rounded-lg aide:border aide:border-destructive/30 aide:bg-destructive/10 aide:px-3 aide:py-2.5 aide:text-destructive"
			>
				<p class="aide:flex-1">{chat.error.message}</p>
				<Button
					variant="outline"
					size="xs"
					data-part="retry"
					class="aide:shrink-0 aide:text-foreground"
					onclick={() => chat.retry()}
				>
					<RotateCcw />
					{chat.strings.retry}
				</Button>
			</div>
		{/if}
	</div>
</ScrollArea>
<div data-part="status" role="status" aria-live="polite" class="aide:sr-only">{announcement}</div>
