<svelte:head>
	<title>Install</title>
	<meta name="description" content="Three steps to add the chat to a SvelteKit app." />
</svelte:head>

<article class="space-y-4">
	<h1 class="text-3xl font-bold">Install</h1>
	<p>Adding the chat takes three steps and no generated files.</p>
	<ol class="list-decimal space-y-2 pl-6">
		<li>Run <code>pnpm add svelte-chat-aide ai</code> together with the adapter of your provider.</li>
		<li>Export the <code>aide()</code> hook from <code>src/hooks.server.ts</code> with your provider.</li>
		<li>Mount <code>&lt;ChatWidget /&gt;</code> in your root layout.</li>
	</ol>
	<p>
		The widget talks to <code>/api/chat</code> on your own origin; the hook also serves <code>/llms.txt</code>,
		<code>/llms-full.txt</code> and a markdown twin of every mapped page.
	</p>
</article>
