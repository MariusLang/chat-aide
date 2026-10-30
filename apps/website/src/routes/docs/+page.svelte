<script lang="ts">
	import { DOCS_NAV } from '$lib/docs-nav';
	import InstallCommand from '$lib/components/site/InstallCommand.svelte';
</script>

<svelte:head>
	<title>Documentation · svelte-chat-aide</title>
	<meta name="description" content="Install, configure, theme and deploy svelte-chat-aide, the AI chat for SvelteKit sites." />
</svelte:head>

<div class="py-10 md:py-14">
	<h1 class="font-display text-4xl sm:text-5xl">Documentation</h1>
	<p class="text-muted-foreground mt-4 max-w-xl text-lg">
		Everything about svelte-chat-aide, from the first install to running it in production.
	</p>
	<div class="mt-6"><InstallCommand /></div>

	<div class="mt-14 space-y-12">
		{#each DOCS_NAV as group (group.title)}
			<section>
				<h2 class="font-display mb-4 text-xl">{group.title}</h2>
				<ul class="grid gap-3 sm:grid-cols-2">
					{#each group.items as item (item.slug)}
						<li>
							<a
								href="/docs/{item.slug}"
								class="px-border px-soft hover:[--px-c:var(--foreground)] m-[3px] hover:bg-muted/60 block h-full p-5"
							>
								<span class="font-semibold">{item.title}</span>
								<span class="text-muted-foreground mt-1 block text-sm">{item.blurb}</span>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
</div>
