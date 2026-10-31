<script lang="ts">
	import './layout.css';
	import { dev } from '$app/environment';
	import { injectAnalytics } from '@vercel/analytics/sveltekit';
	import { ModeWatcher } from 'mode-watcher';
	import { ChatWidget } from '@chat-aide/sveltekit';
	import SiteHeader from '$lib/components/site/SiteHeader.svelte';
	import SiteFooter from '$lib/components/site/SiteFooter.svelte';
	import { chatUi } from '$lib/chat.svelte';

	let { children, data } = $props();

	injectAnalytics({ mode: dev ? 'development' : 'production' });
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
		strings={{ title: 'Ask chat-aide', greeting: 'Hi! I have read every page of this site. What are you building?' }}
	/>
{/if}
