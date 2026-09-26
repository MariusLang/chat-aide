<!--
  The inside of the shadcn window (header, transcript, composer, disclosure), shared by the
  floating/inline window and the sheet. In a sheet the title is the Dialog title so that bits-ui
  labels the dialog with it.
-->
<script lang="ts">
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import X from '@lucide/svelte/icons/x';
	import type { ChatStore } from '../../headless/create-chat.svelte';
	import ChatComposer from './ChatComposer.svelte';
	import ChatTranscript from './ChatTranscript.svelte';
	import { Button } from './ui/button/index.js';
	import { SheetTitle } from './ui/sheet/index.js';

	let {
		chat,
		titleId,
		closable = true,
		sheet = false,
		disclosure
	}: {
		chat: ChatStore;
		titleId: string;
		/** Show the close button (modal windows and sheets). */
		closable?: boolean;
		/** Rendered inside a Sheet: the title is the Dialog title. */
		sheet?: boolean;
		disclosure?: string;
	} = $props();

	const line = $derived(disclosure ?? chat.strings.disclosure("the site's AI provider"));
	const titleClass = 'aide:flex-1 aide:truncate aide:text-sm aide:font-semibold aide:text-foreground';
</script>

<header
	data-part="header"
	class="aide:flex aide:shrink-0 aide:items-center aide:gap-3 aide:border-b aide:border-border aide:px-4 aide:py-3"
>
	<span
		class="aide:flex aide:size-8 aide:shrink-0 aide:items-center aide:justify-center aide:rounded-full aide:bg-primary aide:text-primary-foreground"
		aria-hidden="true"
	>
		<Sparkles class="aide:size-4" />
	</span>
	{#if sheet}
		<SheetTitle data-part="title" id={titleId} class={titleClass}>{chat.strings.title}</SheetTitle>
	{:else}
		<h2 data-part="title" id={titleId} class={titleClass}>{chat.strings.title}</h2>
	{/if}
	{#if closable}
		<Button
			variant="ghost"
			size="icon-sm"
			data-part="close"
			aria-label={chat.strings.close}
			class="aide:-mr-1.5 aide:text-muted-foreground"
			onclick={() => chat.close()}
		>
			<X />
		</Button>
	{/if}
</header>
<ChatTranscript {chat} />
<div class="aide:shrink-0 aide:px-3 aide:pt-1 aide:pb-3">
	<ChatComposer {chat} />
	{#if line}
		<p
			data-part="disclosure"
			class="aide:mt-2 aide:px-1 aide:text-center aide:text-[11px] aide:leading-snug aide:text-muted-foreground"
		>
			{line}
		</p>
	{/if}
</div>
