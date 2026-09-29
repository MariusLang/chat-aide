<!--
  The site map: page cards linked into a tree, drawn in as the scene scrolls into view, with a
  figure holding a magnifier over one of them.
-->
<script lang="ts">
	import Person from './Person.svelte';
	import { cells, notch } from './px';

	/** An orthogonal connector: down, across, down. */
	const elbow = (a: { x: number; y: number }, b: { x: number; y: number }) => {
		const y0 = a.y + 20;
		const y1 = b.y - 18;
		const mid = Math.round((y0 + y1) / 2);
		return `M${a.x} ${y0}V${mid}H${b.x}V${y1}`;
	};

	const nodes = [
		{ x: 250, y: 50, w: 110, label: '/', fill: 'var(--spot)' },
		{ x: 90, y: 170, w: 110, label: '/pricing', fill: 'var(--ill-fill)' },
		{ x: 250, y: 170, w: 110, label: '/docs', fill: 'var(--ill-fill)' },
		{ x: 410, y: 170, w: 110, label: '/blog', fill: 'var(--ill-fill)' },
		{ x: 190, y: 290, w: 120, label: '/docs/install', fill: 'var(--marker)' },
		{ x: 340, y: 290, w: 120, label: '/docs/theme', fill: 'var(--ill-fill)' },
		{ x: 470, y: 290, w: 100, label: '/blog/hi', fill: 'var(--ill-fill)' }
	];
	const edges = [
		[0, 1],
		[0, 2],
		[0, 3],
		[2, 4],
		[2, 5],
		[3, 6]
	];
</script>

<svg
	viewBox="0 0 600 440"
	class="map h-auto w-full overflow-visible"
	shape-rendering="crispEdges"
	stroke-linejoin="miter"
	role="img"
	aria-labelledby="map-title"
>
	<title id="map-title">A map of a site's pages, linked from the home page, with a person inspecting one page</title>

	{#each edges as [a, b], i (i)}
		<path
			class="edge"
			style="--i: {i}"
			pathLength="1"
			d={elbow(nodes[a], nodes[b])}
			fill="none"
			stroke="var(--ill-line)"
			stroke-width="3"
			stroke-dasharray="1"
		/>
	{/each}

	{#each nodes as n, i (n.label)}
		<g class="node" style="--i: {i}" transform="translate({n.x - n.w / 2} {n.y - 18})">
			<path d={notch(4, 4, n.w, 38, 4)} fill="var(--ill-line)" />
			<path d={notch(0, 0, n.w, 38, 4)} fill="var(--ill-paper)" stroke="var(--ill-line)" stroke-width="2.5" />
			<rect x="10" y="12" width="14" height="14" fill={n.fill} stroke="var(--ill-line)" stroke-width="2" />
			<text x="32" y="24" font-size="12" font-family="var(--font-sans)" font-weight="600" fill="var(--foreground)">{n.label}</text>
		</g>
	{/each}

	<!-- magnifier over /docs/install -->
	<g class="lens" transform="translate(150 360)">
		<path d={cells(50, -38, [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2], [3, 3], [4, 3]], 9)} fill="var(--ill-line)" />
		<path d={notch(2, -90, 56, 56, 10)} fill="var(--marker)" fill-opacity="0.45" stroke="var(--ill-line)" stroke-width="4" />
	</g>
	<Person x={90} y={430} scale={0.95} hair="short" beard top="hoodie" shirt="var(--ill-fill)" skin="var(--ill-skin-2)" pose="point" />
</svg>

<style>
	.edge {
		stroke-dashoffset: 1;
	}
	.node {
		opacity: 0;
		translate: 0 8px;
	}
	.lens {
		opacity: 0;
	}
	@supports (animation-timeline: view()) {
		.edge {
			animation: draw linear both;
			animation-timeline: view();
			animation-range: entry calc(20% + var(--i) * 5%) cover calc(40% + var(--i) * 5%);
		}
		.node {
			animation: rise linear both;
			animation-timeline: view();
			animation-range: entry calc(10% + var(--i) * 6%) cover calc(30% + var(--i) * 5%);
		}
		.lens {
			animation: rise linear both;
			animation-timeline: view();
			animation-range: cover 30% cover 45%;
		}
	}
	@supports not (animation-timeline: view()) {
		.edge {
			stroke-dashoffset: 0;
		}
		.node,
		.lens {
			opacity: 1;
			translate: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.edge,
		.node,
		.lens {
			animation: none !important;
			stroke-dashoffset: 0;
			opacity: 1;
			translate: none;
		}
	}
	@keyframes draw {
		to {
			stroke-dashoffset: 0;
		}
	}
	@keyframes rise {
		to {
			opacity: 1;
			translate: 0 0;
		}
	}
</style>
