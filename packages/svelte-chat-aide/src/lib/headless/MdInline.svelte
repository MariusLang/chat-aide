<!--
  Inline answer nodes (spec §3.6). Text only ever reaches the DOM as text nodes; links are the
  already-filtered ones of `parseAnswer`. Same-origin links navigate with `goto`.
-->
<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- hrefs come from answers, already
	   reduced by parseAnswer to same-origin paths or vetted external URLs; no route id to resolve. */
	import { goto } from '$app/navigation';
	import type { MdInline } from '../shared/markdown';
	import Self from './MdInline.svelte';

	let { nodes }: { nodes: MdInline[] } = $props();

	function navigate(event: MouseEvent, href: string): void {
		if (event.defaultPrevented || event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		void goto(href);
	}
</script>

{#each nodes as node, i (i)}
	{#if node.t === 'text'}{node.v}{:else if node.t === 'code'}<code data-part="inline-code"
			>{node.v}</code
		>{:else if node.t === 'em'}<em><Self nodes={node.c} /></em>{:else if node.t === 'strong'}<strong
			><Self nodes={node.c} /></strong
		>{:else if node.t === 'del'}<del><Self nodes={node.c} /></del>{:else if node.t === 'br'}<br
		/>{:else if node.t === 'link'}{#if node.external}<a
				data-part="link"
				data-external=""
				href={node.href}
				target="_blank"
				rel="noopener noreferrer"><Self nodes={node.c} /></a
			>{:else}<a data-part="link" href={node.href} onclick={(e) => navigate(e, node.href)}
				><Self nodes={node.c} /></a
			>{/if}{/if}
{/each}
