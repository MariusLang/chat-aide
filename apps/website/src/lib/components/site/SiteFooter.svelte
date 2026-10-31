<script lang="ts">
	import { GITHUB } from '$lib/chat.svelte';
	import Logo from './Logo.svelte';
</script>

<footer class="border-t">
	<div class="text-muted-foreground mx-auto flex max-w-6xl flex-col gap-6 px-4 pt-10 pb-24 text-sm sm:flex-row sm:items-center sm:px-6">
		<div class="flex items-center gap-2">
			<Logo class="text-foreground h-[30px] w-auto" />
			<span>
				chat-aide is MIT licensed. Icons:
				<a class="hover:text-foreground underline underline-offset-4" href="https://github.com/halfmage/pixelarticons">pixelarticons</a>
				(MIT).
			</span>
		</div>
		<span class="flex-1"></span>
		<nav aria-label="Footer" class="flex flex-wrap gap-x-6 gap-y-2">
			<a class="hover:text-foreground" href="/docs">Docs</a>
			<a class="hover:text-foreground" href="/docs/getting-started">Getting started</a>
			<a class="hover:text-foreground" href="/docs/contributing">Contributing</a>
			<a class="hover:text-foreground" href={GITHUB}>GitHub</a>
			<a class="hover:text-foreground" href="/llms.txt">llms.txt</a>
		</nav>
	</div>
</footer>
