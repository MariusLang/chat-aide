import { error } from '@sveltejs/kit';
import { getDoc } from '$lib/server/docs';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const doc = getDoc(params.slug);
	if (!doc) error(404, 'No such page');
	const { slug, title, description, html, toc, prev, next } = doc;
	return { slug, title, description, html, toc, prev, next };
};
