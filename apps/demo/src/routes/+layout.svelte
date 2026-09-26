<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { ModeWatcher, toggleMode } from 'mode-watcher';
	import { ChatWidget as ShadcnChatWidget } from 'svelte-chat-aide';
	import { ChatWidget as PlainChatWidget } from 'svelte-chat-aide/themes/plain';
	import { ChatWidget as HeadlessChatWidget } from 'svelte-chat-aide/headless';
	import { Button } from '$lib/components/ui/button/index.js';
	import { keep, widgetParams } from '$lib/params';
	import { onMount } from 'svelte';

	let { children, data } = $props();

	// Lets the Playwright suite wait for hydration.
	onMount(() => document.documentElement.setAttribute('data-hydrated', ''));

	const w = $derived(widgetParams(page.url, data.theme));
	const Widget = $derived(
		w.theme === 'plain' ? PlainChatWidget : w.theme === 'headless' ? HeadlessChatWidget : ShadcnChatWidget
	);
	const nav = [
		['/', 'Home'],
		['/docs/intro', 'Introduction'],
		['/docs/install', 'Install'],
		['/pricing', 'Pricing'],
		['/privacy', 'Privacy'],
		['/late', 'Late page']
	];
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<ModeWatcher />

{#snippet headerLauncher({ open, toggle }: { open: boolean; toggle: () => void })}
	<Button variant="outline" data-testid="header-launcher" aria-expanded={open} onclick={toggle}>Ask the docs</Button>
{/snippet}

<header class="border-b border-border bg-background">
	<div class="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-3">
		<a href={keep(page.url, '/')} class="font-semibold">Aide demo</a>
		<nav aria-label="Main" class="flex flex-wrap gap-3 text-sm text-muted-foreground">
			{#each nav as [href, label] (href)}
				<a href={keep(page.url, href)} data-testid="nav-{href}">{label}</a>
			{/each}
		</nav>
		<span class="flex-1"></span>
		<Button variant="ghost" size="sm" data-testid="mode-toggle" onclick={toggleMode}>Toggle dark</Button>
		{#if w.headerLauncher}
			{#key w.theme}
				<Widget launcher={headerLauncher} mode={w.mode} />
			{/key}
		{/if}
	</div>
</header>

<main class="mx-auto max-w-3xl px-4 py-8">
	{@render children()}
</main>

{#if !w.headerLauncher}
	{#key `${w.theme}|${w.position}|${w.mode}`}
		<Widget position={w.position} mode={w.mode} />
	{/key}
{/if}
