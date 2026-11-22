import type { PageServerLoad } from './$types';

/** Sent with `X-Robots-Tag: noindex`, so the page is treated like an excluded one. */
export const load: PageServerLoad = ({ setHeaders }) => {
	setHeaders({ 'x-robots-tag': 'noindex' });
};
