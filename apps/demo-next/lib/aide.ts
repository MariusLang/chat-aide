import { createAide, fromEnv } from '@chat-aide/next';
import { mockModel } from './mock-model';

/**
 * One instance for every route, so there is one site map and one cache. A factory: it runs on the
 * first request, not during `next build`, which has no provider environment.
 */
export const aide = createAide(() => {
	const mock = process.env.AIDE_MOCK === '1';
	return {
		provider: mock ? { name: 'custom', model: 'mock', instance: mockModel() } : fromEnv(process.env),
		origin: process.env.SITE_ORIGIN ?? 'http://localhost:3000',
		suggestions: { '*': ['What is this site?', 'What does /pricing say?'] },
		...(mock ? { rateLimit: false as const, budget: false as const } : {})
	};
});
