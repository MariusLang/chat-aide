<!--
  An answer's markdown as DOM nodes (spec §3.6, §3.8): `parseAnswer` builds a safe tree and this
  component renders it recursively. No HTML string, no image, ever.
-->
<script lang="ts">
	import { parseAnswer, type MdBlock } from '../shared/markdown';
	import { DEFAULT_STRINGS, type Strings } from '../shared/strings';
	import MdInline from './MdInline.svelte';
	import Self from './Markdown.svelte';

	let {
		text = '',
		blocks,
		answerLinks = 'same-origin',
		origin,
		strings = DEFAULT_STRINGS,
		class: className,
		nested = false
	}: {
		/** Markdown source; ignored when `blocks` is given. */
		text?: string;
		blocks?: MdBlock[];
		answerLinks?: 'same-origin' | 'any';
		/** Origin for same-origin links (default `location.origin`). */
		origin?: string;
		strings?: Pick<Strings, 'copy' | 'copied'>;
		class?: string;
		nested?: boolean;
	} = $props();

	const tree = $derived(
		blocks ??
			parseAnswer(text, {
				origin: origin ?? (typeof location === 'undefined' ? 'http://aide.internal' : location.origin),
				answerLinks
			})
	);

	let copied = $state<number | null>(null);

	async function copy(index: number, value: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(value);
			copied = index;
			setTimeout(() => {
				if (copied === index) copied = null;
			}, 1500);
		} catch {
			// Clipboard refused: nothing to do.
		}
	}
</script>

{#snippet render(list: MdBlock[])}
	{#each list as block, i (i)}
		{#if block.t === 'p'}
			<p><MdInline nodes={block.c} /></p>
		{:else if block.t === 'h'}
			<svelte:element this={`h${block.level}`}><MdInline nodes={block.c} /></svelte:element>
		{:else if block.t === 'list'}
			{#if block.ordered}
				<ol start={block.start}>
					{#each block.items as item, j (j)}
						<li><Self blocks={item} {answerLinks} {origin} {strings} nested /></li>
					{/each}
				</ol>
			{:else}
				<ul>
					{#each block.items as item, j (j)}
						<li><Self blocks={item} {answerLinks} {origin} {strings} nested /></li>
					{/each}
				</ul>
			{/if}
		{:else if block.t === 'code'}
			<div data-part="code" data-lang={block.lang}>
				{#if block.lang}<span data-part="code-lang">{block.lang}</span>{/if}
				<button type="button" data-part="copy" onclick={() => copy(i, block.v)}
					>{copied === i ? strings.copied : strings.copy}</button
				>
				<pre><code>{block.v}</code></pre>
			</div>
		{:else if block.t === 'quote'}
			<blockquote><Self blocks={block.c} {answerLinks} {origin} {strings} nested /></blockquote>
		{:else if block.t === 'hr'}
			<hr />
		{/if}
	{/each}
{/snippet}

{#if nested}
	{@render render(tree)}
{:else}
	<div data-part="markdown" class={className}>{@render render(tree)}</div>
{/if}
