/**
 * Test-only endpoint (AIDE_MOCK=1, otherwise 404): whether a marker text reached the mock model
 * or the shared page cache, the cached routes, and the server's outbound fetch origins.
 * `/api/**` is excluded from the site map by default, so this is never crawled.
 */
import { error, json } from '@sveltejs/kit';
import { MOCK, aideHandle, outbound } from '$lib/server/aide';
import { recorder } from '$lib/server/mock-model';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	if (!MOCK()) error(404, 'Not found');
	const marker = url.searchParams.get('marker') ?? '';
	const { cache } = aideHandle().handler;
	const cached = cache.routes().map((route) => ({ route, record: JSON.stringify(cache.peek(route) ?? null) }));
	return json({
		prompts: recorder.prompts.length,
		// Any recent prompt: tests run in parallel against one server.
		markerInPrompt: marker !== '' && recorder.prompts.some((p) => p.includes(marker)),
		markerInCache: marker !== '' && cached.some((c) => c.record.includes(marker)),
		cachedRoutes: cached.map((c) => c.route),
		outbound: [...new Set(outbound)]
	});
};
