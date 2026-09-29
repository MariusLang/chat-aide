<!--
  The scroll story: a visitor walks past three pages of a site while the section is pinned. At
  each page they ask the chat something and it answers from that page. Scroll drives everything;
  nothing moves on its own except the walk cycle while walking.
-->
<script lang="ts">
	import { fade } from 'svelte/transition';
	import { scrollProgress } from '$lib/actions/parallax';
	import Person from './Person.svelte';
	import { cells, notch, tail, CHECK } from './px';

	/** A pixel vase for the shop's home page. */
	const VASE: [number, number][] = [
		[2, 0], [3, 0], [4, 0],
		[3, 1],
		[2, 2], [3, 2], [4, 2],
		...[3, 4, 5, 6].flatMap((r) => [0, 1, 2, 3, 4, 5, 6].map((c) => [c, r] as [number, number])),
		[1, 2], [5, 2],
		[1, 7], [2, 7], [3, 7], [4, 7], [5, 7],
		[2, 8], [3, 8], [4, 8]
	];

	const PAGES = [
		{
			cx: 220,
			label: '/',
			q: 'What is this site?',
			a: ['A shop for handmade', 'ceramics, shipped EU-wide.'],
			title: 'They land on any page.',
			sub: 'The chat already knows which page they are on.'
		},
		{
			cx: 575,
			label: '/pricing',
			q: 'Is shipping free?',
			a: ['Yes, over €50.', 'See the pricing page.'],
			title: 'They ask in their own words.',
			sub: 'No search box syntax, no menus to dig through.'
		},
		{
			cx: 930,
			label: '/docs/care',
			q: 'Dishwasher safe?',
			a: ['Yes, all glazed pieces.', 'Care guide, section 2.'],
			title: 'It answers from your pages.',
			sub: 'And links to where it found the answer.'
		}
	];

	// Scroll progress 0‥1 split into walk and dwell segments: [walk, dwell] per page.
	const SEGMENTS = [
		{ from: 0, to: 0.1, x0: 40, x1: PAGES[0].cx - 70 },
		{ from: 0.1, to: 0.3, dwell: 0 },
		{ from: 0.3, to: 0.42, x0: PAGES[0].cx - 70, x1: PAGES[1].cx - 70 },
		{ from: 0.42, to: 0.62, dwell: 1 },
		{ from: 0.62, to: 0.74, x0: PAGES[1].cx - 70, x1: PAGES[2].cx - 70 },
		{ from: 0.74, to: 1.01, dwell: 2 }
	] as const;

	let p = $state(0);

	const seg = $derived(SEGMENTS.find((s) => p >= s.from && p < s.to) ?? SEGMENTS[SEGMENTS.length - 1]);
	const walking = $derived('x0' in seg);
	const charX = $derived.by(() => {
		if ('dwell' in seg) return PAGES[seg.dwell].cx - 70;
		const t = (p - seg.from) / (seg.to - seg.from);
		return seg.x0 + (seg.x1 - seg.x0) * t;
	});
	const stage = $derived(Math.min(2, Math.max(0, SEGMENTS.findIndex((s) => s === seg) >> 1)));
	const dwelling = $derived('dwell' in seg ? seg.dwell : -1);
	// Answer appears a little after the question, within the dwell.
	const answered = $derived('dwell' in seg && (p - seg.from) / (seg.to - seg.from) > 0.3);
	const visited = (i: number) => charX >= PAGES[i].cx - 71;

	// On narrow screens the scene is wider than its box; pan so the walker and bubbles stay centred.
	const MIN_W = 860;
	let boxW = $state(1200);
	const pan = $derived.by(() => {
		const w = Math.max(boxW, MIN_W);
		const focus = (charX + 120) * (w / 1200);
		return Math.min(0, Math.max(boxW - w, boxW / 2 - focus));
	});
</script>

<section class="relative" style="height: 360svh" use:scrollProgress={(v) => (p = v)} aria-label="How a visit goes">
	<div class="sticky top-0 flex h-svh flex-col justify-center gap-6 overflow-hidden py-16">
		<div class="mx-auto w-full max-w-6xl px-4 sm:px-6">
			<div class="grid min-h-[6.5rem] items-end" aria-live="polite">
				{#key stage}
					<div in:fade={{ duration: 250 }} out:fade={{ duration: 120 }} class="col-start-1 row-start-1">
						<h2 class="font-display text-3xl text-balance sm:text-5xl">
							{PAGES[stage].title}
						</h2>
						<p class="text-muted-foreground mt-2 text-lg">{PAGES[stage].sub}</p>
					</div>
				{/key}
			</div>
		</div>

		<div class="mx-auto w-full max-w-6xl px-2 sm:px-6">
			<div bind:clientWidth={boxW}>
			<svg
				viewBox="0 0 1200 560"
				class="scene-svg h-auto"
				style="translate: {pan}px 0"
				shape-rendering="crispEdges"
				stroke-linejoin="miter"
				role="img"
				aria-labelledby="walk-title"
			>
				<title id="walk-title">A visitor walking past three pages of a site, asking the chat a question at each</title>

				<!-- the three pages -->
				{#each PAGES as page, i (page.label)}
					{@const on = visited(i)}
					<g transform="translate({page.cx - 140} 24)">
						<path d={notch(8, 8, 280, 236, 8)} fill="var(--ill-line)" />
						<path
							d={notch(0, 0, 280, 236, 8)}
							fill="var(--ill-paper)"
							stroke={on ? 'var(--spot)' : 'var(--ill-line)'}
							stroke-width="3"
							class="board"
						/>
						<path d="M0 34H280" stroke="var(--ill-line)" stroke-width="2.5" opacity="0.5" />
						{#each [12, 26, 40] as cx (cx)}
							<rect x={cx} y="12" width="9" height="9" fill="none" stroke="var(--ill-line)" stroke-width="2" />
						{/each}
						<rect x="72" y="8" width="136" height="18" fill="var(--ill-shade)" />
						<text x="140" y="21" text-anchor="middle" font-size="11" font-family="var(--font-sans)" fill="var(--muted-foreground)">
							{page.label}
						</text>
						{#if i === 0}
							<rect x="22" y="54" width="150" height="14" fill="var(--ill-line)" opacity="0.85" />
							<rect x="22" y="78" width="200" height="8" fill="var(--ill-shade)" />
							<rect x="22" y="102" width="112" height="110" fill="var(--ill-fill)" />
							<path d={cells(50, 120, VASE, 8)} fill="var(--ill-line)" />
							<rect x="146" y="102" width="112" height="50" fill="var(--ill-fill)" />
							<rect x="146" y="162" width="112" height="50" fill="var(--ill-fill)" />
						{:else if i === 1}
							<rect x="22" y="54" width="110" height="14" fill="var(--ill-line)" opacity="0.85" />
							{#each [0, 1, 2] as col (col)}
								<g transform="translate({22 + col * 82} 84)">
									<rect width="72" height="128" fill={col === 1 ? 'var(--ill-fill)' : 'var(--ill-paper)'} stroke="var(--ill-line)" stroke-width="2" />
									<rect x="12" y="16" width="30" height="10" fill="var(--ill-line)" opacity="0.7" />
									<rect x="12" y="38" width="44" height="6" fill="var(--ill-shade)" />
									<rect x="12" y="52" width="36" height="6" fill="var(--ill-shade)" />
									<rect x="12" y="100" width="48" height="16" fill="var(--ill-line)" opacity="0.85" />
								</g>
							{/each}
						{:else}
							<rect x="22" y="52" width="56" height="164" fill="var(--ill-shade)" />
							<rect x="94" y="54" width="130" height="14" fill="var(--ill-line)" opacity="0.85" />
							{#each [0, 1, 2, 3, 4] as l (l)}
								<rect x="94" y={80 + l * 14} width={160 - (l % 2) * 36} height="7" fill="var(--ill-shade)" />
							{/each}
							<rect x="94" y="156" width="164" height="54" fill="var(--ill-line)" opacity="0.9" />
							<rect x="106" y="170" width="90" height="6" fill="var(--ill-paper)" opacity="0.8" />
							<rect x="106" y="186" width="120" height="6" fill="var(--ill-paper)" opacity="0.55" />
						{/if}

						<!-- read badge -->
						<g transform="translate(248 -22)" class="badge" class:on>
							<path d={notch(0, 0, 30, 30, 5)} fill="var(--marker)" stroke="var(--ill-line)" stroke-width="3" />
							<path d={cells(5, 8, CHECK, 4)} fill="var(--marker-ink)" />
						</g>
					</g>
				{/each}

				<!-- ground and trail -->
				<path d="M10 532H1190" stroke="var(--ill-line)" stroke-width="3" opacity="0.18" />
				<path d="M40 532H{charX}" stroke="var(--spot)" stroke-width="4" stroke-dasharray="4 10" />

				<!-- conversation at the current page -->
				{#if dwelling >= 0}
					{@const page = PAGES[dwelling]}
					{#key dwelling}
						<g transform="translate({page.cx - 30} 300)">
							<g class="pop">
								<path d={notch(0, 0, 200, 44, 6)} fill="var(--marker)" stroke="var(--ill-line)" stroke-width="3" />
								<path d={tail(10, 44, 7, -1)} fill="var(--marker)" stroke="var(--ill-line)" stroke-width="3" />
								<path d="M11.5 44H22.5" stroke="var(--marker)" stroke-width="4" />
								<text x="16" y="28" font-size="17" font-weight="650" font-family="var(--font-sans)" fill="var(--marker-ink)">{page.q}</text>
							</g>
							{#if answered}
								<g class="pop" transform="translate(40 66)">
									<path d={notch(0, 0, 252, 72, 6)} fill="var(--spot)" stroke="var(--ill-line)" stroke-width="3" />
									<text x="16" y="30" font-size="15.5" font-weight="600" font-family="var(--font-sans)" fill="var(--spot-ink)">{page.a[0]}</text>
									<text x="16" y="54" font-size="15.5" font-family="var(--font-sans)" fill="var(--spot-ink)" opacity="0.8">{page.a[1]}</text>
								</g>
							{/if}
						</g>
					{/key}
				{/if}

				<Person
					x={charX}
					y={532}
					scale={1.2}
					hair="long"
					hairColor="oklch(0.5 0.11 42)"
					top="tee"
					shirt="var(--ill-paper)"
					bag
					skin="var(--ill-skin-1)"
					pose={walking ? 'stand' : answered ? 'wave' : 'phone'}
					{walking}
				/>
			</svg>
			</div>
		</div>

		<div class="mx-auto flex w-full max-w-6xl gap-1.5 px-4 sm:px-6" aria-hidden="true">
			{#each [0, 1, 2] as i (i)}
				<span class="bg-border h-1.5 flex-1 overflow-hidden">
					<span
						class="bg-spot block h-full origin-left"
						style="transform: scaleX({Math.min(1, Math.max(0, (p - [0, 0.3, 0.62][i]) / 0.32))})"
					></span>
				</span>
			{/each}
		</div>
	</div>
</section>

<style>
	.scene-svg {
		width: max(100%, 860px);
		max-width: none;
		overflow: visible;
	}
	.board {
		transition: stroke 0.3s;
	}
	.badge {
		transform-box: fill-box;
		transform-origin: center;
		scale: 0;
		transition: scale 0.3s steps(3);
	}
	.badge.on {
		scale: 1;
	}
	.pop {
		transform-box: fill-box;
		transform-origin: 0% 100%;
		animation: pop 0.3s steps(3) both;
	}
	@keyframes pop {
		from {
			opacity: 0;
			translate: 0 8px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.pop {
			animation: none;
		}
		.badge {
			transition: none;
		}
	}
</style>
