<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Request headers</title></svelte:head>

<article class="space-y-4">
	<h1 class="text-3xl font-bold">Request headers</h1>
	<p>This page lists the headers of the request that rendered it.</p>
	<ul class="font-mono text-xs">
		{#each data.headers as line, i (i)}<li>{line}</li>{/each}
	</ul>
</article>
