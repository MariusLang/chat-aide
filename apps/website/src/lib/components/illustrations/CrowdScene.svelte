<!--
  The closing scene: three people around one big chat bubble, talking. Bubbles drift with scroll.
-->
<script lang="ts">
	import Person from './Person.svelte';
	import { notch, tail } from './px';
</script>

<svg
	viewBox="0 0 640 360"
	class="h-auto w-full overflow-visible"
	shape-rendering="crispEdges"
	stroke-linejoin="miter"
	role="img"
	aria-labelledby="crowd-title"
>
	<title id="crowd-title">Three people chatting around a large speech bubble</title>

	<g class="parallax" data-speed="-0.08">
		<g transform="translate(200 20)">
			<path d={notch(8, 8, 240, 150, 14)} fill="var(--ill-line)" />
			<path d={notch(0, 0, 240, 150, 14)} fill="var(--spot)" stroke="var(--ill-line)" stroke-width="3.5" />
			<path d={tail(80, 150, 14, 1)} fill="var(--spot)" stroke="var(--ill-line)" stroke-width="3.5" />
			<path d="M82 150H106" stroke="var(--spot)" stroke-width="5" />
			<rect x="32" y="38" width="150" height="16" fill="var(--spot-ink)" />
			<rect x="32" y="66" width="176" height="16" fill="var(--spot-ink)" opacity="0.75" />
			<rect x="32" y="94" width="110" height="16" fill="var(--spot-ink)" opacity="0.5" />
		</g>
	</g>
	<g class="parallax" data-speed="-0.16">
		<g transform="translate(70 70)">
			<path d={notch(0, 0, 92, 44, 6)} fill="var(--marker)" stroke="var(--ill-line)" stroke-width="3" />
			<text x="46" y="29" text-anchor="middle" font-size="18" font-weight="800" font-family="var(--font-display)" fill="var(--marker-ink)">how?</text>
		</g>
		<g transform="translate(490 110)">
			<path d={notch(0, 0, 84, 44, 6)} fill="var(--ill-paper)" stroke="var(--ill-line)" stroke-width="3" />
			<text x="42" y="29" text-anchor="middle" font-size="18" font-weight="800" font-family="var(--font-display)" fill="var(--ill-line)">oh!</text>
		</g>
	</g>

	<path d="M40 344H600" stroke="var(--ill-line)" stroke-width="3" opacity="0.18" />
	<Person x={130} y={344} scale={1.05} hair="curly" top="tee" shirt="var(--ill-paper)" skin="var(--ill-skin-3)" pose="wave" />
	<Person x={330} y={344} scale={1.1} hair="bob" hairColor="oklch(0.7 0.12 75)" top="hoodie" shirt="var(--marker)" bottom="skirt" skin="var(--ill-skin-1)" pose="cheer" />
	<Person x={520} y={344} scale={1.02} flip hair="short" hairColor="oklch(0.4 0.07 50)" top="jacket" shirt="var(--spot)" skin="var(--ill-skin-2)" pose="phone" />
</svg>
