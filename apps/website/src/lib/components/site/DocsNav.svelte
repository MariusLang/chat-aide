<script lang="ts">
	import { page } from '$app/state';
	import { DOCS_NAV } from '$lib/docs-nav';

	let { onnavigate }: { onnavigate?: () => void } = $props();
</script>

<nav aria-label="Documentation" class="space-y-7 text-sm">
	{#each DOCS_NAV as group (group.title)}
		<div>
			<p class="text-foreground mb-2 px-3 font-semibold">{group.title}</p>
			<ul class="space-y-0.5">
				{#each group.items as item (item.slug)}
					{@const href = `/docs/${item.slug}`}
					<li>
						<a
							{href}
							onclick={onnavigate}
							aria-current={page.url.pathname === href ? 'page' : undefined}
							class="text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-secondary aria-[current=page]:text-foreground block px-3 py-1.5 transition-colors aria-[current=page]:font-medium"
						>
							{item.title}
						</a>
					</li>
				{/each}
			</ul>
		</div>
	{/each}
</nav>
