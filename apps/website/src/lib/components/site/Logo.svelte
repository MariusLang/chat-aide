<script lang="ts">
	import { LOGO_H, LOGO_RUNS, LOGO_W, type LogoCode } from '$lib/logo';

	let { class: className = '' }: { class?: string } = $props();

	const fill: Record<LogoCode, string> = {
		y: 'var(--marker)',
		b: 'oklch(0.47 0.26 264)',
		w: '#fff',
		k: 'currentColor'
	};
</script>

<svg viewBox="0 0 {LOGO_W} {LOGO_H}" class={className} shape-rendering="crispEdges" aria-hidden="true">
	{#each LOGO_RUNS as r, i (i)}
		<rect x={r.col} y={r.row} width={r.len + 0.02} height="1.02" fill={fill[r.code]} />
	{/each}
</svg>
