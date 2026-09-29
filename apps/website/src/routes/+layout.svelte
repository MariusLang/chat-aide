<script lang="ts">
	import './layout.css';
	import { ModeWatcher } from 'mode-watcher';
	import { ChatWidget } from 'svelte-chat-aide';
	import SiteHeader from '$lib/components/site/SiteHeader.svelte';
	import SiteFooter from '$lib/components/site/SiteFooter.svelte';
	import { chatUi } from '$lib/chat.svelte';

	let { children, data } = $props();
</script>

<svelte:head><link rel="icon" href="/favicon.svg" type="image/svg+xml" /></svelte:head>

<ModeWatcher />
<SiteHeader />
<main id="content">
	{@render children()}
</main>
<SiteFooter />

{#if data.chat}
	<ChatWidget
		bind:open={chatUi.open}
		strings={{ title: 'Ask svelte-chat-aide', greeting: 'Hi! I have read every page of this site. What are you building?' }}
	/>
{/if}
