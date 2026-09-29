<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';
</script>

<svelte:head><title>{page.status} · svelte-chat-aide</title></svelte:head>

<div class="mx-auto max-w-xl px-4 py-32 text-center">
	<p class="font-display text-7xl text-spot">{page.status}</p>
	<h1 class="font-display mt-4 text-2xl">
		{page.status === 404 ? 'This page does not exist.' : 'Something went wrong on our side.'}
	</h1>
	<p class="text-muted-foreground mt-3">Try the docs, or ask the chat where to find what you need.</p>
	<div class="mt-8 flex justify-center gap-3">
		<Button href="/docs">Open the docs</Button>
		<Button variant="outline" href="/">Go home</Button>
	</div>
</div>
