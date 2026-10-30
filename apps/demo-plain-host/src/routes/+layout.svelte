<!--
  A fresh SvelteKit app without Tailwind or shadcn-svelte (acceptance #1, second half): the
  three steps of spec §1 and nothing else — the hook, and the default widget in the layout.
-->
<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { ChatWidget } from '@chat-aide/sveltekit';

	let { children } = $props();

	// Lets the Playwright suite wait for hydration.
	onMount(() => document.documentElement.setAttribute('data-hydrated', ''));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<ChatWidget />
