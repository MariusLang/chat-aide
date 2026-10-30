import { env } from '$env/dynamic/private';
import type { Handle } from '@sveltejs/kit';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { aide, fromEnv, type AideHandle } from '@chat-aide/sveltekit/server';

/** A mock model for AIDE_MOCK=1 (the Playwright run): it echoes the question. */
function mockModel() {
	return new MockLanguageModelV4({
		doStream: async () => ({
			stream: simulateReadableStream({
				chunks: [
					{ type: 'stream-start', warnings: [] },
					{ type: 'text-start', id: 't' },
					{ type: 'text-delta', id: 't', delta: 'Hello from the plain host.' },
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

export const handle: Handle = (input) => {
	instance ??= aide({
		provider: env.AIDE_MOCK === '1' ? { name: 'custom', model: 'mock', instance: mockModel() } : fromEnv(env),
		origin: env.ORIGIN || undefined
	});
	return instance(input);
};
