<svelte:head><title>Not indexed, by header</title></svelte:head>

<article class="space-y-4">
	<h1 class="text-3xl font-bold">Not indexed, by header</h1>
	<p>
		This page is sent with the header <code>X-Robots-Tag: noindex</code>, so it is treated like an excluded page:
		never mapped, never served as markdown and never read into a prompt. Its marker phrase is
		copper meadow ferryboat.
	</p>
</article>
