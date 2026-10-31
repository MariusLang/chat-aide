<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import PixelIcon from '$lib/components/site/PixelIcon.svelte';
	import DocsNav from '$lib/components/site/DocsNav.svelte';
	import { cn } from '$lib/utils.js';

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
		<div class="bg-background sticky top-14 z-30 -mx-4 border-b px-4 py-1 sm:-mx-6 sm:px-6 md:hidden">
			<Sheet.Root bind:open>
				<Sheet.Trigger class={cn(buttonVariants({ variant: 'ghost' }), '-ml-3 h-11 px-3')}>
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
