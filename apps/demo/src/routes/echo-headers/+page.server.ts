import type { PageServerLoad } from './$types';

/** Echoes the request headers into the page, so a test can see what a server-side read carried (acceptance #13). */
export const load: PageServerLoad = ({ request }) => ({
	headers: [...request.headers].map(([name, value]) => `${name}: ${value}`)
});
