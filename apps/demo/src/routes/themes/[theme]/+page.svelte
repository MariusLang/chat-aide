<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Theme: {data.theme}</title></svelte:head>

<article class="space-y-4">
	<h1 class="text-3xl font-bold">The {data.theme} theme</h1>
	<p>
		This page mounts the {data.theme} theme of the widget. The same Playwright suite runs against every theme:
		keyboard open and close, the focus trap, Escape, the live announcement, 320 pixels without horizontal scroll and
		reduced motion.
	</p>
</article>
