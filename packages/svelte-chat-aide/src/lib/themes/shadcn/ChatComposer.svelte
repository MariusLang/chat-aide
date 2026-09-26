<!--
  The shadcn theme's composer (spec §3.8): a shadcn Textarea with send and stop icon buttons.
  Enter sends, Shift+Enter adds a line; same data-parts as the headless Composer.
-->
<script lang="ts">
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Square from '@lucide/svelte/icons/square';
	import { LIMIT_DEFAULTS } from '../../shared/limits';
	import type { ChatStore } from '../../headless/create-chat.svelte';
	import { Button } from './ui/button/index.js';
	import { Textarea } from './ui/textarea/index.js';
	import { cn } from './utils.js';

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

<form
	data-part="composer"
	class={cn(
		'aide:flex aide:items-end aide:gap-1.5 aide:rounded-xl aide:border aide:border-input aide:bg-background aide:p-1.5 aide:shadow-xs aide:transition-[color,box-shadow] aide:focus-within:border-ring aide:focus-within:ring-3 aide:focus-within:ring-ring/50 aide:dark:bg-input/30',
		className
	)}
	onsubmit={submit}
>
	<Textarea
		data-part="input"
		bind:value
		{onkeydown}
		{maxlength}
		rows={1}
		placeholder={chat.strings.placeholder}
		aria-label={chat.strings.placeholder}
		class="aide:max-h-40 aide:min-h-9 aide:flex-1 aide:resize-none aide:rounded-lg aide:border-0 aide:bg-transparent aide:px-2 aide:py-2 aide:text-sm aide:shadow-none aide:focus-visible:ring-0 aide:md:text-sm aide:dark:bg-transparent"
	/>
	{#if busy}
		<Button
			data-part="stop"
			variant="secondary"
			size="icon-sm"
			aria-label={chat.strings.stop}
			title={chat.strings.stop}
			class="aide:rounded-lg"
			onclick={() => chat.stop()}
		>
			<Square class="aide:size-3 aide:fill-current" />
		</Button>
	{:else}
		<Button
			type="submit"
			data-part="send"
			size="icon-sm"
			aria-label={chat.strings.send}
			title={chat.strings.send}
			class="aide:rounded-lg"
			disabled={!value.trim()}
		>
			<ArrowUp />
		</Button>
	{/if}
</form>
