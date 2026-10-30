import { DOCS_NAV } from '$lib/docs-nav';
import type { RequestHandler } from './$types';

/**
 * The site's own llms.txt. The chat reads it first: its order becomes the outline's order and its
 * descriptions fill the outline before any page is read. /llms-full.txt is still generated.
 */
export const GET: RequestHandler = () => {
	const lines = [
		'# chat-aide',
		'',
		'> An AI chat for your own site, and an llms.txt for it, both derived from the site at run time. For SvelteKit, Next.js and React, and any server that speaks web-standard Request and Response.',
		'',
		'- [Home](/): what chat-aide does, in short',
		'- [Documentation](/docs): all docs pages',
		''
	];
	for (const group of DOCS_NAV) {
		lines.push(`## ${group.title}`, '');
		for (const d of group.items) lines.push(`- [${d.title}](/docs/${d.slug}.md): ${d.blurb}`);
		lines.push('');
	}
	return new Response(lines.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
