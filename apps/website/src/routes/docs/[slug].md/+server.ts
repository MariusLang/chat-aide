import { error } from '@sveltejs/kit';
import { getDoc } from '$lib/server/docs';
import type { RequestHandler } from './$types';

/** The markdown twin of each docs page, which the chat and llms.txt readers prefer over HTML. */
export const GET: RequestHandler = ({ params }) => {
	const doc = getDoc(params.slug);
	if (!doc) error(404, 'No such page');
	// A `>` line under the H1 is what readers take as the page description.
	const body = doc.description ? doc.markdown.replace(/^# .+$/m, (h) => `${h}\n\n> ${doc.description}`) : doc.markdown;
	return new Response(body, { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
};
