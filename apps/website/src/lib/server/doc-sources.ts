/**
 * The docs' markdown, by slug: the repository's own `docs/*.md` plus the website-only pages in
 * `src/content`. No renderer here, so the server hook can load it without paying for shiki.
 */
import type { Page } from '@chat-aide/sveltekit/server';
import { DOCS_NAV } from '$lib/docs-nav';

const repoDocs = import.meta.glob('../../../../../docs/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;
const localDocs = import.meta.glob('../../content/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

export const sources = new Map<string, string>();
for (const [path, raw] of Object.entries({ ...repoDocs, ...localDocs })) {
	sources.set(path.split('/').pop()!.replace(/\.md$/, ''), raw);
}

function headingsOf(markdown: string): Page['headings'] {
	const headings: Page['headings'] = [];
	let fenced = false;
	for (const line of markdown.split('\n')) {
		if (line.startsWith('```')) fenced = !fenced;
		const m = fenced ? null : /^(##|###) (.+)$/.exec(line);
		if (m) headings.push({ level: m[1] === '##' ? 2 : 3, text: m[2].replace(/`/g, '') });
	}
	return headings;
}

/**
 * What the chat knows: every page of the site, from the markdown it was built from. The home page
 * says nothing the introduction does not, so it carries the introduction's text.
 */
export function chatPages(): Page[] {
	const links = DOCS_NAV.flatMap((g) => g.items);
	const docs = links.flatMap((d): Page[] => {
		const text = sources.get(d.slug);
		if (!text) return [];
		return [{ route: `/docs/${d.slug}`, title: d.title, description: d.blurb, headings: headingsOf(text), text }];
	});
	return [
		{
			route: '/',
			title: 'chat-aide',
			description: 'What chat-aide does, in short',
			headings: [],
			text: sources.get('introduction') ?? ''
		},
		{
			route: '/docs',
			title: 'Documentation',
			description: 'All docs pages',
			headings: [],
			text: links.map((d) => `- [${d.title}](/docs/${d.slug}): ${d.blurb}`).join('\n')
		},
		...docs
	];
}
