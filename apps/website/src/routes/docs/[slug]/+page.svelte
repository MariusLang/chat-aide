<script lang="ts">
	import PixelIcon from '$lib/components/site/PixelIcon.svelte';
	import { GITHUB } from '$lib/chat.svelte';

	let { data } = $props();
	const localPages = ['introduction', 'customizing', 'contributing'];
	const source = $derived(
		localPages.includes(data.slug)
			? `${GITHUB}/blob/main/apps/website/src/content/${data.slug}.md`
			: `${GITHUB}/blob/main/docs/${data.slug}.md`
	);
</script>

<svelte:head>
	<title>{data.title} · svelte-chat-aide docs</title>
	{#if data.description}<meta name="description" content={data.description} />{/if}
</svelte:head>

<div class="flex gap-10">
	<article class="min-w-0 flex-1 py-10 md:py-14">
		<h1 class="font-display text-4xl text-balance sm:text-[2.75rem] sm:leading-[1.08]">
			{data.title}
		</h1>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- rendered from the repository's own markdown -->
		<div class="prose mt-8 max-w-[72ch]">{@html data.html}</div>

		<nav aria-label="Pager" class="mt-16 grid gap-3 border-t pt-8 sm:grid-cols-2">
			{#if data.prev}
				<a href="/docs/{data.prev.slug}" class="px-border px-soft hover:[--px-c:var(--foreground)] m-[3px] hover:bg-muted/60 p-4">
					<span class="text-muted-foreground flex items-center gap-1 text-sm"><PixelIcon name="arrowLeft" class="size-4" /> Previous</span>
					<span class="mt-1 block font-semibold">{data.prev.title}</span>
				</a>
			{:else}<span></span>{/if}
			{#if data.next}
				<a href="/docs/{data.next.slug}" class="px-border px-soft hover:[--px-c:var(--foreground)] m-[3px] hover:bg-muted/60 p-4 text-right">
					<span class="text-muted-foreground flex items-center justify-end gap-1 text-sm">Next <PixelIcon name="arrowRight" class="size-4" /></span>
					<span class="mt-1 block font-semibold">{data.next.title}</span>
				</a>
			{/if}
		</nav>
		<p class="text-muted-foreground mt-8 text-sm">
			<a class="hover:text-foreground underline underline-offset-4" href={source}>Edit this page on GitHub</a>
		</p>
	</article>

	{#if data.toc.length > 1}
		<aside class="hidden w-52 shrink-0 xl:block">
			<div class="sticky top-14 max-h-[calc(100svh-3.5rem)] overflow-y-auto py-14 text-sm">
				<p class="mb-3 font-semibold">On this page</p>
				<ul class="space-y-2">
					{#each data.toc as t (t.id)}
						<li class:pl-3={t.depth === 3}>
							<a href="#{t.id}" class="text-muted-foreground hover:text-foreground block leading-snug">{t.text}</a>
						</li>
					{/each}
				</ul>
			</div>
		</aside>
	{/if}
</div>
