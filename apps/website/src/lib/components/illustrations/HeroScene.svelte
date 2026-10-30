<!--
  The hero: a site in a browser window, its chat open, a question and an answer arriving once on
  load. Two visitors stand beside it. Floating bits drift with scroll (`data-speed`).
-->
<script lang="ts">
	import Person from './Person.svelte';
	import { cells, notch, tail, SPARKLE } from './px';

	const line = 'var(--ill-line)';
</script>

<svg
	viewBox="0 0 600 500"
	class="h-auto w-full overflow-visible"
	shape-rendering="crispEdges"
	stroke-linejoin="miter"
	role="img"
	aria-labelledby="hero-scene-title"
>
	<title id="hero-scene-title">Two visitors on a website, one asking its chat how to install, the chat answering</title>

	<g data-speed="-0.12" class="parallax">
		<g transform="translate(40 90)">
			<path d={notch(0, 0, 54, 36, 6)} fill="var(--marker)" stroke={line} stroke-width="3" />
			<path d={tail(12, 36, 6, -1)} fill="var(--marker)" stroke={line} stroke-width="3" />
			<path d="M13.5 36H22.5" stroke="var(--marker)" stroke-width="4" />
			<path d={cells(12, 15, [[0, 0], [2, 0], [4, 0]], 6)} fill="var(--marker-ink)" />
		</g>
	</g>
	<g data-speed="-0.22" class="parallax">
		<path d={cells(516, 50, SPARKLE, 5)} fill="var(--spot)" />
	</g>

	<!-- browser window -->
	<g transform="translate(120 56)">
		<path d={notch(8, 8, 400, 300, 10)} fill={line} />
		<path d={notch(0, 0, 400, 300, 10)} fill="var(--ill-paper)" stroke={line} stroke-width="3" />
		<path d="M0 40H400" stroke={line} stroke-width="3" />
		{#each [16, 32, 48] as cx (cx)}
			<rect x={cx} y="15" width="10" height="10" fill="none" stroke={line} stroke-width="2" />
		{/each}
		<rect x="120" y="11" width="190" height="18" fill="var(--ill-shade)" />
		<text x="215" y="24" text-anchor="middle" font-size="10.5" font-family="var(--font-sans)" fill="var(--muted-foreground)">yoursite.dev/docs</text>

		<!-- page skeleton -->
		<rect x="24" y="62" width="140" height="14" fill={line} opacity="0.85" />
		<rect x="24" y="88" width="190" height="8" fill="var(--ill-shade)" />
		<rect x="24" y="104" width="170" height="8" fill="var(--ill-shade)" />
		<rect x="24" y="120" width="180" height="8" fill="var(--ill-shade)" />
		<rect x="24" y="146" width="96" height="64" fill="var(--ill-fill)" />
		<rect x="128" y="146" width="96" height="64" fill="var(--ill-fill)" />
		<rect x="24" y="226" width="200" height="8" fill="var(--ill-shade)" />
		<rect x="24" y="242" width="150" height="8" fill="var(--ill-shade)" />

		<!-- chat window -->
		<g transform="translate(236 58)">
			<path d={notch(0, 0, 150, 226, 6)} fill="var(--card)" stroke={line} stroke-width="3" />
			<path d="M0 30H150" stroke={line} stroke-width="2" opacity="0.4" />
			<rect x="10" y="10" width="10" height="10" fill="var(--spot)" />
			<rect x="28" y="11" width="46" height="8" fill={line} opacity="0.7" />

			<g class="msg msg-1">
				<path d={notch(44, 44, 96, 42, 4)} fill="var(--marker)" stroke={line} stroke-width="2" />
				<text x="54" y="61" font-size="10" font-family="var(--font-sans)" font-weight="600" fill="var(--marker-ink)">How do I</text>
				<text x="54" y="75" font-size="10" font-family="var(--font-sans)" font-weight="600" fill="var(--marker-ink)">install it?</text>
			</g>
			<g class="msg typing">
				<path d={notch(10, 98, 46, 24, 4)} fill="var(--ill-shade)" />
				{#each [20, 30, 40] as cx (cx)}
					<rect class="dot" x={cx} y="107" width="6" height="6" fill={line} />
				{/each}
			</g>
			<g class="msg msg-2">
				<path d={notch(10, 98, 130, 78, 4)} fill="var(--spot)" />
				<text x="20" y="116" font-size="10" font-weight="600" font-family="var(--font-sans)" fill="var(--spot-ink)">One command:</text>
				<rect x="20" y="124" width="110" height="20" fill="var(--spot-ink)" />
				<text x="24" y="137.5" font-size="6.4" textLength="102" lengthAdjust="spacingAndGlyphs" font-family="ui-monospace, monospace" fill="var(--spot)">pnpm add @chat-aide/sveltekit</text>
				<rect x="20" y="152" width="80" height="6" fill="var(--spot-ink)" opacity="0.7" />
				<rect x="20" y="163" width="56" height="6" fill="var(--spot-ink)" opacity="0.45" />
			</g>
			<path d={notch(10, 190, 130, 24, 4)} fill="var(--ill-paper)" stroke={line} stroke-width="2" opacity="0.7" />
		</g>
	</g>

	<!-- launcher -->
	<g class="launcher" transform="translate(482 354)">
		<path d={notch(0, 0, 52, 52, 8)} fill="var(--spot)" stroke={line} stroke-width="3" />
		<path d={notch(13, 14, 26, 17, 3)} fill="var(--spot-ink)" />
		<path d={tail(17, 31, 4, -1)} fill="var(--spot-ink)" />
	</g>

	<!-- ground -->
	<path d="M20 468H580" stroke={line} stroke-width="3" opacity="0.18" />

	<Person x={80} y={466} scale={1.3} hair="bun" hairColor="oklch(0.36 0.06 45)" top="hoodie" shirt="var(--marker)" skin="var(--ill-skin-2)" pose="phone" />
	<Person x={205} y={470} scale={1.15} hair="curly" top="jacket" shirt="var(--spot)" skin="var(--ill-skin-3)" glasses pose="point" />
</svg>

<style>
	.msg {
		opacity: 0;
		animation: pop 0.4s steps(3) forwards;
	}
	.msg-1 {
		animation-delay: 0.5s;
	}
	.typing {
		animation:
			pop 0.2s steps(2) 1.1s forwards,
			hide 0.1s steps(1) 2.3s forwards;
	}
	.msg-2 {
		animation-delay: 2.4s;
	}
	.dot {
		animation: blink 0.9s steps(1) infinite;
	}
	.dot:nth-of-type(2) {
		animation-delay: 0.3s;
	}
	.dot:nth-of-type(3) {
		animation-delay: 0.6s;
	}
	.launcher {
		animation: hop 3.2s steps(1) 3.2s infinite;
	}
	@keyframes pop {
		from {
			opacity: 0;
			translate: 0 6px;
		}
		to {
			opacity: 1;
			translate: 0 0;
		}
	}
	@keyframes hide {
		to {
			opacity: 0;
		}
	}
	@keyframes blink {
		50% {
			opacity: 0.2;
		}
	}
	@keyframes hop {
		0%,
		100% {
			translate: 0 0;
		}
		84% {
			translate: 0 -6px;
		}
		92% {
			translate: 0 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.msg,
		.msg-2 {
			animation: none;
			opacity: 1;
		}
		.typing {
			display: none;
		}
		.launcher,
		.dot {
			animation: none;
		}
	}
</style>
