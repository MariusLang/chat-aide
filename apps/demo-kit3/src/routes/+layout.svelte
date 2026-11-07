<!--
  A SvelteKit 3 site (issue #21): the hook typed with Kit 3's `Handle`, variables declared in
  `src/env.ts`, prerendered pages, and the headless widget.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { ChatWidget } from '@chat-aide/sveltekit/headless';

	let { children } = $props();

	// Lets the Playwright suite wait for hydration.
	onMount(() => document.documentElement.setAttribute('data-hydrated', ''));
</script>

{@render children()}

<ChatWidget suggestions={['What is this site?']} />
