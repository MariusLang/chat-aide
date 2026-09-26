<svelte:head>
	<title>Introduction</title>
	<meta name="description" content="What svelte-chat-aide is and how it reads your site." />
</svelte:head>

<article class="space-y-4">
	<h1 class="text-3xl font-bold">Introduction</h1>
	<p>
		svelte-chat-aide adds an AI chat to a SvelteKit site. The chat knows the site because the server builds a site
		map at run time: it renders pages through the app's own handler, extracts their text and keeps a small cache.
	</p>
	<h2 class="text-xl font-semibold">How answers are grounded</h2>
	<p>
		Every answer starts from the page the visitor is on, plus an outline of the whole site. When the model needs
		another page it calls a read_page tool, which renders that page once and caches it.
	</p>
</article>
