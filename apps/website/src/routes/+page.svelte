<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import PixelIcon from '$lib/components/site/PixelIcon.svelte';
	import HeroScene from '$lib/components/illustrations/HeroScene.svelte';
	import WalkStory from '$lib/components/illustrations/WalkStory.svelte';
	import MapScene from '$lib/components/illustrations/MapScene.svelte';
	import CrowdScene from '$lib/components/illustrations/CrowdScene.svelte';
	import InstallCommand from '$lib/components/site/InstallCommand.svelte';
	import { parallax } from '$lib/actions/parallax';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { chatUi } from '$lib/chat.svelte';
	import { page } from '$app/state';

	let { data } = $props();
	const chatOn = $derived(Boolean(page.data.chat));

	const providers = [
		['Anthropic', 'OpenAI', 'Google Gemini', 'Mistral', 'Groq', 'xAI', 'DeepSeek', 'Cohere', 'OpenRouter'],
		['Amazon Bedrock', 'Azure OpenAI', 'Vertex AI', 'Together AI', 'Fireworks', 'DeepInfra', 'Cerebras', 'Perplexity', 'Ollama']
	];
	const points = [
		['Nothing to index', 'It reads the running app. No embeddings, no build step, nothing to commit.'],
		['llms.txt for free', 'The same map is served as /llms.txt and a .md twin of every page.'],
		['Costs stay bounded', 'Per-visitor rate limits and daily token budgets, on by default.']
	];
</script>

<svelte:head>
	<title>chat-aide · An AI chat that knows your site</title>
	<meta
		name="description"
		content="A drop-in AI chat that answers from your own pages. For SvelteKit, Next.js and React, and any server that speaks fetch."
	/>
</svelte:head>

<div use:parallax>
	<!-- hero -->
	<section class="relative overflow-hidden">
		<div class="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-14 pb-20 sm:px-6 md:grid-cols-[1.05fr_1fr] md:pt-20 md:pb-28">
			<div class="hero-copy">
				<h1 class="font-display text-[clamp(3.4rem,9vw,6.6rem)] leading-[0.9] text-balance">
					Let your site answer back.
				</h1>
				<p class="text-muted-foreground mt-6 max-w-md text-lg leading-relaxed text-pretty">
					A drop-in AI chat that has read every page of your site. One package, one hook, one component.
				</p>
				<div class="mt-8 flex flex-wrap gap-3">
					<Button size="lg" href="/docs/introduction#pick-your-framework" class="h-11 px-5 text-[0.95rem]">Get started</Button>
					{#if chatOn}
						<Button size="lg" variant="outline" class="h-11 px-5 text-[0.95rem]" onclick={() => (chatUi.open = true)}>
							<PixelIcon name="message" /> Ask this site
						</Button>
					{:else}
						<Button size="lg" variant="outline" href="/docs" class="h-11 px-5 text-[0.95rem]">Read the docs</Button>
					{/if}
				</div>
				<div class="mt-8">
					<InstallCommand />
				</div>
				<p class="text-muted-foreground mt-4 text-sm">
					For SvelteKit, Next.js and React, and any server that speaks <code class="font-mono">fetch</code>.
				</p>
			</div>
			<div class="relative mx-auto w-full max-w-xl">
				<HeroScene />
			</div>
		</div>
	</section>

	<!-- scroll story -->
	<div class="bg-muted/50 border-y">
		<WalkStory />
	</div>

	<!-- how it reads -->
	<section class="mx-auto grid max-w-6xl items-center gap-12 px-4 py-24 sm:px-6 md:grid-cols-2 md:py-32">
		<div class="order-2 md:order-1">
			<MapScene />
		</div>
		<div class="order-1 md:order-2">
			<h2 class="font-display text-4xl text-balance sm:text-5xl">
				It reads your site like a visitor does.
			</h2>
			<dl class="mt-10 space-y-7">
				{#each points as [title, text] (title)}
					<div>
						<dt class="font-semibold">{title}</dt>
						<dd class="text-muted-foreground mt-1">{text}</dd>
					</div>
				{/each}
			</dl>
		</div>
	</section>

	<!-- setup -->
	<section class="bg-muted/50 border-y">
		<div class="mx-auto max-w-6xl px-4 py-24 sm:px-6 md:py-32">
			<h2 class="font-display max-w-xl text-4xl text-balance sm:text-5xl">
				Running in three steps.
			</h2>
			<Tabs.Root value="sveltekit" class="mt-12">
				<Tabs.List class="bg-transparent h-auto gap-3 p-0">
					{#each data.frameworks as f (f.id)}
						<Tabs.Trigger
							value={f.id}
							class="border-border data-active:border-foreground data-active:bg-primary data-active:text-primary-foreground! dark:data-active:text-primary-foreground! dark:data-active:bg-primary dark:data-active:border-foreground h-11 flex-none border-[3px] px-5 text-base font-semibold data-active:shadow-none"
						>
							{f.label}
						</Tabs.Trigger>
					{/each}
				</Tabs.List>
				{#each data.frameworks as f (f.id)}
					<Tabs.Content value={f.id} class="mt-10">
						<ol class="space-y-10">
							{#each f.steps as step, i (step.title)}
								<li class="grid min-w-0 gap-4 md:grid-cols-[16rem_1fr] md:gap-10">
									<div class="flex items-start gap-3 md:pt-3">
										<span
											class="bg-primary text-primary-foreground font-display grid size-8 shrink-0 place-items-center text-sm"
										>
											{i + 1}
										</span>
										<h3 class="pt-1 text-lg font-semibold">{step.title}</h3>
									</div>
									<div class="bg-card px-border px-soft m-[3px] min-w-0 overflow-hidden">
										<div class="text-muted-foreground border-b-[3px] px-4 py-2 font-mono text-xs">{step.file}</div>
										<!-- eslint-disable-next-line svelte/no-at-html-tags -- highlighted on the server from constants -->
										<div class="snippet">{@html step.html}</div>
									</div>
								</li>
							{/each}
						</ol>
						<p class="text-muted-foreground mt-10">
							That is the whole install. <a href={f.guide} class="font-semibold bg-marker text-black px-1">Read the {f.label} guide</a> for providers, origin and verification.
						</p>
					</Tabs.Content>
				{/each}
			</Tabs.Root>
			<p class="text-muted-foreground mt-6">
				On Astro, React Router, Hono, Nuxt or Bun, mount the same server with <code class="font-mono text-sm">createAide</code>:
				<a href="/docs/other-frameworks" class="text-foreground font-semibold underline underline-offset-4">other frameworks</a>.
			</p>
		</div>
	</section>

	<!-- providers -->
	<section class="overflow-hidden py-24 md:py-32">
		<div class="mx-auto max-w-6xl px-4 sm:px-6">
			<h2 class="font-display text-4xl sm:text-5xl">Bring any model.</h2>
			<p class="text-muted-foreground mt-4 max-w-lg text-lg">
				Every adapter of the AI SDK, called directly with your key.
			</p>
		</div>
		<div class="mt-14 space-y-3" aria-label="Supported providers">
			{#each providers as row, r (r)}
				<ul class="marquee flex w-max items-center gap-x-8 px-4" class:reverse={r === 1}>
					{#each [...row, ...row] as name, i (i)}
						<li
							class="font-display flex items-center gap-8 text-4xl whitespace-nowrap sm:text-6xl"
							class:outline-text={r === 1}
							aria-hidden={i >= row.length ? 'true' : undefined}
						>
							{name}<span class="bg-spot inline-block size-3 sm:size-4" aria-hidden="true"></span>
						</li>
					{/each}
				</ul>
			{/each}
		</div>
	</section>

	<!-- closing -->
	<section class="border-t">
		<div class="mx-auto grid max-w-6xl items-center gap-12 px-4 py-24 sm:px-6 md:grid-cols-[1fr_1.1fr] md:py-28">
			<div>
				<h2 class="font-display text-4xl text-balance sm:text-5xl">Ask it something.</h2>
				<p class="text-muted-foreground mt-4 max-w-md text-lg">
					The chat on this page runs on chat-aide and has read all of these docs.
				</p>
				<div class="mt-8 flex flex-wrap gap-3">
					{#if chatOn}
						<Button size="lg" class="h-11 px-5 text-[0.95rem]" onclick={() => (chatUi.open = true)}>
							<PixelIcon name="message" /> Open the chat
						</Button>
					{/if}
					<Button size="lg" variant={chatOn ? 'outline' : 'default'} href="/docs" class="h-11 px-5 text-[0.95rem]">
						Read the docs
					</Button>
				</div>
			</div>
			<CrowdScene />
		</div>
	</section>
</div>

<style>
	.hero-copy > :global(*) {
		animation: enter 0.7s cubic-bezier(0.2, 0.7, 0.2, 1) both;
	}
	.hero-copy > :global(:nth-child(2)) {
		animation-delay: 0.06s;
	}
	.hero-copy > :global(:nth-child(3)) {
		animation-delay: 0.12s;
	}
	.hero-copy > :global(:nth-child(n + 4)) {
		animation-delay: 0.18s;
	}
	@keyframes enter {
		from {
			opacity: 0;
			translate: 0 14px;
		}
	}

	.snippet :global(pre) {
		overflow-x: auto;
		padding: 1rem;
		font-size: 0.8rem;
		line-height: 1.6;
		tab-size: 2;
		background: transparent !important;
	}
	.snippet :global(pre span) {
		color: var(--shiki-light);
	}
	:global(.dark) .snippet :global(pre span) {
		color: var(--shiki-dark);
	}

	@supports (animation-timeline: view()) {
		.marquee {
			animation: slide linear both;
			animation-timeline: view();
		}
		.marquee.reverse {
			animation-name: slide-back;
		}
	}
	.outline-text {
		color: transparent;
		-webkit-text-stroke: 1.5px var(--foreground);
	}
	@keyframes slide {
		from {
			translate: 0 0;
		}
		to {
			translate: -35% 0;
		}
	}
	@keyframes slide-back {
		from {
			translate: -35% 0;
		}
		to {
			translate: 0 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.hero-copy > :global(*),
		.marquee {
			animation: none !important;
		}
	}
</style>
