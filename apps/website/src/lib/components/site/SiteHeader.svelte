<script lang="ts">
	import { page } from '$app/state';
	import { toggleMode } from 'mode-watcher';
	import PixelIcon from './PixelIcon.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { GITHUB } from '$lib/chat.svelte';
	import Logo from './Logo.svelte';

	const links = [
		{ href: '/docs', label: 'Docs', active: (p: string) => p.startsWith('/docs') },
		{ href: '/docs/introduction#pick-your-framework', label: 'Get started', active: () => false }
	];
</script>

<header class="bg-background/80 supports-[backdrop-filter]:bg-background/65 sticky top-0 z-40 border-b backdrop-blur-md">
	<div class="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6">
		<a href="/" class="mr-3 flex items-center gap-2 font-display text-[1.05rem]">
			<Logo class="h-[30px] w-auto" />
			<span>chat-aide</span>
		</a>
		<nav aria-label="Main" class="hidden items-center gap-1 text-sm sm:flex">
			{#each links as l (l.href)}
				<a
					href={l.href}
					aria-current={l.active(page.url.pathname) ? 'page' : undefined}
					class="text-muted-foreground hover:text-foreground aria-[current=page]:text-foreground px-3 py-1.5 transition-colors aria-[current=page]:font-medium"
				>
					{l.label}
				</a>
			{/each}
		</nav>
		<span class="flex-1"></span>
		<a href="/docs" class="text-muted-foreground hover:text-foreground px-2 text-sm sm:hidden">Docs</a>
		<Button variant="ghost" size="icon" href={GITHUB} aria-label="GitHub repository">
			<PixelIcon name="github" class="size-6" />
		</Button>
		<Button variant="ghost" size="icon" onclick={toggleMode} aria-label="Toggle dark mode">
			<PixelIcon name="sun" class="size-6 dark:hidden" />
			<PixelIcon name="moon" class="hidden size-6 dark:block" />
		</Button>
	</div>
</header>
