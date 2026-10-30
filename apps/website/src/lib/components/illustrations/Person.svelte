<svelte:options namespace="svg" />

<!--
  A pixel-art figure for the illustrations (see pixel-person.ts). Local origin is between the
  feet; the figure is about 165 units tall. Place it with `x`, `y` and `scale` inside a parent
  <svg>. While `walking`, two frames alternate; standing figures blink now and then.
-->
<script lang="ts">
	import { sprite, CENTER, GROUND, type Bottom, type Code, type Hair, type Pose, type Top } from './pixel-person';

	let {
		x = 0,
		y = 0,
		scale = 1,
		flip = false,
		skin = 'var(--ill-skin-1)',
		hair = 'short',
		hairColor = 'var(--ill-hair)',
		top = 'tee',
		shirt = 'var(--ill-paper)',
		bottom = 'pants',
		pants = 'var(--ill-pants)',
		glasses = false,
		beard = false,
		bag = false,
		pose = 'stand',
		walking = false,
		class: className = ''
	}: {
		x?: number;
		y?: number;
		scale?: number;
		flip?: boolean;
		skin?: string;
		hair?: Hair;
		hairColor?: string;
		top?: Top;
		shirt?: string;
		bottom?: Bottom;
		pants?: string;
		glasses?: boolean;
		beard?: boolean;
		bag?: boolean;
		pose?: Pose;
		walking?: boolean;
		class?: string;
	} = $props();

	/** Size of one pixel in the parent's units. */
	const P = 5.5;

	const look = $derived({ hair, top, bottom, glasses, beard, bag, pose: walking ? ('stand' as const) : pose });
	const frames = $derived(walking ? [sprite(look, 0), sprite(look, 1)] : [sprite(look, 0)]);

	const colors = $derived<Record<Code, string>>({
		s: skin,
		h: hairColor,
		t: shirt,
		d: `color-mix(in oklch, ${shirt}, black 16%)`,
		w: 'var(--ill-paper)',
		p: pants,
		k: 'var(--pix-ink)',
		e: 'var(--pix-ink)',
		n: `color-mix(in oklch, ${skin}, black 45%)`,
		b: 'var(--ill-blush)',
		a: 'var(--spot)',
		m: 'var(--marker)',
		o: 'var(--ill-line)'
	});
	const isEye = (code: Code) => code === 'e';
	/** Runs overlap the next row and column a little, so no hairline gaps show at any zoom. */
	const O = 0.6;
</script>

<g class="person {className}" transform="translate({x} {y}) scale({flip ? -scale : scale} {scale})" shape-rendering="crispEdges">
	<rect x={-5 * P} y={-P * 0.6} width={10 * P} height={P * 0.6} fill="#000" opacity="0.12" />
	{#each frames as runs, f (f)}
		<g class="frame" class:walk-a={walking && f === 0} class:walk-b={walking && f === 1}>
			{#each runs as r, i (i)}
				{#if isEye(r.code)}
					<rect x={(r.col - CENTER) * P} y={(r.row - GROUND) * P} width={r.len * P + O} height={P + O} style="fill: {skin}" />
				{/if}
				<rect
					class:eye={isEye(r.code)}
					x={(r.col - CENTER) * P}
					y={(r.row - GROUND) * P}
					width={r.len * P + O}
					height={P + O}
					style="fill: {colors[r.code]}"
				/>
			{/each}
		</g>
	{/each}
</g>

<style>
	.walk-a {
		animation: frame-a 0.5s steps(1) infinite;
	}
	.walk-b {
		animation: frame-a 0.5s steps(1) -0.25s infinite;
	}
	@keyframes frame-a {
		0% {
			opacity: 1;
		}
		50% {
			opacity: 0;
		}
	}
	.eye {
		animation: blink 4.5s steps(1) infinite;
	}
	@keyframes blink {
		0% {
			opacity: 1;
		}
		95% {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.walk-b {
			display: none;
		}
		.walk-a,
		.eye {
			animation: none;
		}
	}
</style>
