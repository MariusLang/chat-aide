export interface DocLink {
	slug: string;
	title: string;
	blurb: string;
}

export interface DocGroup {
	title: string;
	items: DocLink[];
}

/** The docs sidebar, in reading order. Each slug is a file in `docs/` or `src/content`. */
export const DOCS_NAV: DocGroup[] = [
	{
		title: 'Start here',
		items: [{ slug: 'introduction', title: 'Introduction', blurb: 'What it is, how it reads your site.' }]
	},
	{
		title: 'Frameworks',
		items: [
			{ slug: 'getting-started', title: 'SvelteKit', blurb: 'Install, add the hook and the widget.' },
			{ slug: 'nextjs', title: 'Next.js and React', blurb: 'Route handlers and the React widget.' },
			{ slug: 'other-frameworks', title: 'Other frameworks', blurb: 'Astro, React Router, Hono, Nuxt, Bun.' }
		]
	},
	{
		title: 'Guides',
		items: [
			{ slug: 'customizing', title: 'Customizing', blurb: 'Persona, suggestions, strings, your own widget.' },
			{ slug: 'configuration', title: 'Configuration', blurb: 'Every option and limit.' },
			{ slug: 'providers', title: 'Providers', blurb: 'Anthropic, OpenAI, Google and more.' },
			{ slug: 'theming', title: 'Theming', blurb: 'Widget props, the three themes, CSP.' },
			{ slug: 'llms-txt', title: 'llms.txt', blurb: 'Read one, serve one.' }
		]
	},
	{
		title: 'Operate',
		items: [
			{ slug: 'deployment', title: 'Deployment', blurb: 'Origin, serverless, shared stores.' },
			{ slug: 'security', title: 'Security', blurb: 'What the endpoint refuses and why.' }
		]
	},
	{
		title: 'Project',
		items: [{ slug: 'contributing', title: 'Contributing', blurb: 'Run the repo, check a change.' }]
	}
];
