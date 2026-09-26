<script lang="ts">
	import { onMount } from 'svelte';

	/** A marker the server never sees: it exists only in the browser's DOM (acceptance #14). */
	const LATE_TEXT =
		'The violet harbour lighthouse opens at dawn. This paragraph is written by the browser after load, so the ' +
		'server-rendered page is thin and the widget sends the text of the page as the visitor sees it. ' +
		'Ferries leave every forty minutes from the northern pier, tickets are sold on board, and dogs travel free.';

	let text = $state('');
	onMount(() => {
		text = LATE_TEXT;
	});
</script>

<svelte:head>
	<title>Late page</title>
</svelte:head>

<article class="space-y-4">
	<h1 class="text-3xl font-bold">Late page</h1>
	<p data-testid="late-text">{text}</p>
</article>
