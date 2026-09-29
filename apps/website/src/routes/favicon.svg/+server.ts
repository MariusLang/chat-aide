import { logoSvg } from '$lib/logo';
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = () =>
	new Response(logoSvg(), { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' } });
