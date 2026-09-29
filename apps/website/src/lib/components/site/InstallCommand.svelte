<script lang="ts">
	import PixelIcon from './PixelIcon.svelte';

	let { command = 'pnpm add svelte-chat-aide' }: { command?: string } = $props();
	let copied = $state(false);

	async function copy() {
		await navigator.clipboard.writeText(command);
		copied = true;
		setTimeout(() => (copied = false), 1600);
	}
</script>

<div class="bg-card px-border m-[3px] inline-flex max-w-full items-center gap-3 py-1.5 pr-1.5 pl-4 font-mono text-sm">
	<span class="text-muted-foreground select-none">$</span>
	<code class="truncate">{command}</code>
	<button
		type="button"
		onclick={copy}
		class="text-muted-foreground hover:bg-muted hover:text-foreground grid size-8 shrink-0 place-items-center transition-colors"
		aria-label={copied ? 'Copied' : 'Copy install command'}
	>
		{#if copied}<PixelIcon name="check" class="size-5" />{:else}<PixelIcon name="copy" class="size-5" />{/if}
	</button>
</div>
