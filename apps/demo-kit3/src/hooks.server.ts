import * as env from '$app/env/private';
import type { Handle } from '@sveltejs/kit/hooks';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { aide, fromEnv, type AideHandle } from '@chat-aide/sveltekit/server';

/** A mock model for AIDE_MOCK=1 (the Playwright run): it answers with a same-origin link. */
function mockModel() {
	return new MockLanguageModelV4({
		doStream: async () => ({
			stream: simulateReadableStream({
				chunks: [
					{ type: 'stream-start', warnings: [] },
					{ type: 'text-start', id: 't' },
					{ type: 'text-delta', id: 't', delta: 'Hello from SvelteKit 3. See [About](/about).' },
					{ type: 'text-end', id: 't' },
					{
						type: 'finish',
						finishReason: { unified: 'stop', raw: 'stop' },
						usage: {
							inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
							outputTokens: { total: 1, text: 1, reasoning: undefined }
						}
					}
				]
			})
		})
	});
}

let instance: AideHandle | undefined;

// Typed with Kit 3's `Handle` from `@sveltejs/kit/hooks`, so svelte-check proves `aide()` fits it.
export const handle: Handle = (input) => {
	instance ??= aide({
		provider: env.AIDE_MOCK === '1' ? { name: 'custom', model: 'mock', instance: mockModel() } : fromEnv(env),
		origin: env.ORIGIN
	});
	return instance(input);
};
