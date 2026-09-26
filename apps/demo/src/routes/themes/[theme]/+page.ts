import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	if (!['shadcn', 'plain', 'headless'].includes(params.theme)) error(404, 'Unknown theme');
	return { theme: params.theme };
};
