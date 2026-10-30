import { highlight } from '$lib/server/docs';
import type { PageServerLoad } from './$types';

interface Step {
	title: string;
	file: string;
	lang: string;
	code: string;
}

/** The setup, per framework: the same three steps, in each framework's own files. */
const FRAMEWORKS: { id: string; label: string; guide: string; steps: Step[] }[] = [
	{
		id: 'sveltekit',
		label: 'SvelteKit',
		guide: '/docs/getting-started',
		steps: [
			{ title: 'Install the package', file: 'terminal', lang: 'sh', code: 'pnpm add @chat-aide/sveltekit' },
			{
				title: 'Add the server hook',
				file: 'src/hooks.server.ts',
				lang: 'ts',
				code: `import { aide } from '@chat-aide/sveltekit/server';
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
	import { ChatWidget } from '@chat-aide/sveltekit';
	let { children } = $props();
</script>

{@render children()}
<ChatWidget />`
			}
		]
	},
	{
		id: 'next',
		label: 'Next.js',
		guide: '/docs/nextjs',
		steps: [
			{ title: 'Install the packages', file: 'terminal', lang: 'sh', code: 'pnpm add @chat-aide/next @chat-aide/react' },
			{
				title: 'Add the route handler',
				file: 'app/api/chat/route.ts',
				lang: 'ts',
				code: `import { createAide, fromEnv } from '@chat-aide/next';

const aide = createAide(() => ({
	provider: fromEnv(process.env),
	origin: 'https://example.com'
}));

export const { GET, POST } = aide.chat;`
			},
			{
				title: 'Drop in the widget',
				file: 'app/layout.tsx',
				lang: 'tsx',
				code: `import '@chat-aide/react/plain.css';
import { ChatWidget } from '@chat-aide/react';

export default function RootLayout({ children }) {
	return (
		<html lang="en">
			<body>
				{children}
				<ChatWidget />
			</body>
		</html>
	);
}`
			}
		]
	}
];

export const load: PageServerLoad = () => ({
	frameworks: FRAMEWORKS.map(({ steps, ...f }) => ({
		...f,
		install: steps[0].code,
		steps: steps.map(({ code, lang, ...s }) => ({ ...s, html: highlight(code, lang) }))
	}))
});
