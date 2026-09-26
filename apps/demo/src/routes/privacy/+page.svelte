<svelte:head>
	<title>Privacy</title>
	<meta name="description" content="What leaves the visitor's browser when they use the chat." />
</svelte:head>

<article class="space-y-4">
	<h1 class="text-3xl font-bold">Privacy</h1>
	<p>
		What leaves the browser: the visitor's messages, the route, a per-tab session id and, only when the server asks
		for it, the text of the page as the visitor sees it. It goes to this site's server and from there to the AI
		provider. The thread is kept in sessionStorage for the tab and nowhere else.
	</p>
	<p>
		The library stores none of it. Pages read by the server are read without the visitor's cookies, so nothing
		behind a login reaches the shared cache.
	</p>
</article>
