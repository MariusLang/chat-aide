<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import PixelIcon from '$lib/components/site/PixelIcon.svelte';
	import DocsNav from '$lib/components/site/DocsNav.svelte';

	let { children } = $props();
	let open = $state(false);
</script>

<div class="mx-auto flex max-w-6xl gap-10 px-4 sm:px-6">
	<aside class="hidden w-52 shrink-0 md:block">
		<div class="sticky top-14 max-h-[calc(100svh-3.5rem)] overflow-y-auto py-10 pr-2">
			<DocsNav />
		</div>
	</aside>

	<div class="min-w-0 flex-1">
		<div class="bg-background/90 sticky top-14 z-30 -mx-4 border-b px-4 py-2 backdrop-blur md:hidden">
			<Sheet.Root bind:open>
				<Sheet.Trigger class={buttonVariants({ variant: 'ghost', size: 'sm' })}>
					<PixelIcon name="menu" /> Menu
				</Sheet.Trigger>
				<Sheet.Content side="left" class="w-72 overflow-y-auto p-6">
					<Sheet.Title class="sr-only">Documentation</Sheet.Title>
					<div class="pt-6"><DocsNav onnavigate={() => (open = false)} /></div>
				</Sheet.Content>
			</Sheet.Root>
		</div>
		{@render children()}
	</div>
</div>
