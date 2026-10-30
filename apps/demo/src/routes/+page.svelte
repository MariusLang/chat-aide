<script lang="ts">
	import { page } from '$app/state';
	import { keep } from '$lib/params';
</script>

<svelte:head>
	<title>Aide demo — home</title>
	<meta name="description" content="A demo site for @chat-aide/sveltekit, the AI chat for your own SvelteKit site." />
</svelte:head>

<article class="space-y-4">
	<h1 class="text-3xl font-bold">Aide demo</h1>
	<p>
		This site shows @chat-aide/sveltekit: a chat widget that answers questions about the pages of the site it lives on.
		Nothing is generated ahead of time; the server reads the site's own pages at run time, the same way a visitor
		would, and hands the relevant text to the model.
	</p>
	<p>
		Read the <a class="underline" href={keep(page.url, '/docs/intro')}>introduction</a>, follow the
		<a class="underline" href={keep(page.url, '/docs/install')}>install guide</a>, check the
		<a class="underline" href={keep(page.url, '/pricing')}>pricing</a> or the
		<a class="underline" href={keep(page.url, '/privacy')}>privacy notes</a>. The
		<a class="underline" href={keep(page.url, '/late')}>late page</a> fills its text in the browser after load.
	</p>
	<p>
		Themes: <a class="underline" href="/themes/shadcn">shadcn</a>, <a class="underline" href="/themes/plain">plain</a>,
		<a class="underline" href="/themes/headless">headless</a>. Internal pages such as
		<a class="underline" href="/secret">the secret page</a> and <a class="underline" href="/logout">log out</a> are
		never mapped.
	</p>
</article>
