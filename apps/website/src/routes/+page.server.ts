import { highlight } from '$lib/server/docs';
import type { PageServerLoad } from './$types';

const STEPS = [
	{
		title: 'Install the package',
		file: 'terminal',
		lang: 'sh',
		code: 'pnpm add svelte-chat-aide'
	},
	{
		title: 'Add the server hook',
		file: 'src/hooks.server.ts',
		lang: 'ts',
		code: `import { aide } from 'svelte-chat-aide/server';
import { ANTHROPIC_API_KEY } from '$env/static/private';

export const handle = aide({
	provider: { name: 'anthropic', apiKey: ANTHROPIC_API_KEY, model: 'claude-haiku-4-5' },
	origin: 'https://example.com'
});`
	},
	{
		title: 'Drop in the widget',
		file: 'src/routes/+layout.svelte',
		lang: 'svelte',
		code: `<script>
	import { ChatWidget } from 'svelte-chat-aide';
	let { children } = $props();
</script>

{@render children()}
<ChatWidget />`
	}
];

export const load: PageServerLoad = () => ({
	steps: STEPS.map(({ code, lang, ...s }) => ({ ...s, html: highlight(code, lang) }))
});
