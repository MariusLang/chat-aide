/**
 * The demo's @chat-aide/sveltekit hook. With AIDE_MOCK=1 the provider is the mock model, the rate
 * limit and budgets are off (one Playwright worker sends many turns from one address), and every
 * outbound `fetch` of the server is recorded for the network audit (acceptance #2).
 */
import { env } from '$env/dynamic/private';
import type { Handle } from '@sveltejs/kit';
import { aide, fromEnv, type AideHandle } from '@chat-aide/sveltekit/server';
import { mockModel } from './mock-model';

export const MOCK = (): boolean => env.AIDE_MOCK === '1';

/** Origins the server fetched over the network (mock mode only). */
export const outbound: string[] = [];

let instance: AideHandle | undefined;

/**
 * Created on the first request, not at import: the build analyses server modules without the
 * run-time environment, and `fromEnv` throws when the provider variables are missing.
 */
export function aideHandle(): AideHandle {
	if (instance) return instance;
	const mock = MOCK();
	if (mock) {
		const real = globalThis.fetch;
		globalThis.fetch = (input, init) => {
			const url = input instanceof Request ? input.url : String(input);
			try {
				outbound.push(new URL(url).origin);
			} catch {
				outbound.push(url);
			}
			return real(input, init);
		};
	}
	instance = aide({
		provider: mock ? { name: 'custom', model: 'mock', instance: mockModel() } : fromEnv(env),
		// The site's public origin, read by the demo itself (the library reads no environment).
		origin: env.ORIGIN || undefined,
		pages: { exclude: ['/secret'] },
		suggestions: { '*': ['What is this site?', 'How do I install it?'], '/pricing': ['What does it cost?'] },
		...(mock ? { rateLimit: false as const, budget: false as const } : {})
	});
	return instance;
}

export const handle: Handle = (input) => aideHandle()(input);
