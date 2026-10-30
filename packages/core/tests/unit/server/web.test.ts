import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAide, headerAddress, toAideEvent } from '../../../src/server/web';

const ORIGIN = 'https://example.test';
const USAGE = {
	inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
	outputTokens: { total: 1, text: 1, reasoning: undefined }
};
const model = () =>
	new MockLanguageModelV4({
		doStream: async () => ({
			stream: simulateReadableStream({
				chunks: [
					{ type: 'stream-start', warnings: [] },
					{ type: 'text-start', id: 't' },
					{ type: 'text-delta', id: 't', delta: 'ok' },
					{ type: 'text-end', id: 't' },
					{ type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: USAGE }
				] as never[]
			})
		})
	});
const provider = { name: 'custom', model: 'm', instance: model() };

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('headerAddress', () => {
	it('prefers x-real-ip, then the last x-forwarded-for hop', () => {
		expect(headerAddress(new Request(ORIGIN, { headers: { 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' } }))).toBe('1.1.1.1');
		expect(headerAddress(new Request(ORIGIN, { headers: { 'x-forwarded-for': '9.9.9.9, 2.2.2.2' } }))).toBe('2.2.2.2');
		expect(headerAddress(new Request(ORIGIN))).toBe('');
	});
});

describe('toAideEvent', () => {
	it('carries the url, the given address and the platform, and is never a sub-request', () => {
		const platform = { context: { waitUntil: () => {} } };
		const event = toAideEvent(new Request(`${ORIGIN}/api/chat?route=/`), { clientAddress: '3.3.3.3', platform });
		expect(event.url.pathname).toBe('/api/chat');
		expect(event.getClientAddress()).toBe('3.3.3.3');
		expect(event.platform).toBe(platform);
		expect(event.isSubRequest).toBe(false);
	});

	it('takes the address from a function of the request', () => {
		const event = toAideEvent(new Request(ORIGIN, { headers: { 'cf-connecting-ip': '4.4.4.4' } }), {
			clientAddress: (r) => r.headers.get('cf-connecting-ip') ?? ''
		});
		expect(event.getClientAddress()).toBe('4.4.4.4');
	});
});

describe('createAide', () => {
	it('throws without origin', () => {
		expect(() => createAide({ provider })).toThrow(/origin is required/);
	});

	it('routes the endpoint and the llms paths by pathname, and 404s the rest', async () => {
		vi.stubGlobal('fetch', async () => new Response('Not found', { status: 404 }));
		const aide = createAide({ provider, origin: ORIGIN });
		const headers = { origin: ORIGIN, 'x-real-ip': '5.5.5.5' };
		expect((await aide.fetch(new Request(`${ORIGIN}/api/chat?route=/`, { headers }))).status).toBe(200);
		expect((await aide.fetch(new Request(`${ORIGIN}/llms.txt`, { headers }))).status).toBe(200);
		expect((await aide.fetch(new Request(`${ORIGIN}/elsewhere`, { headers }))).status).toBe(404);
	});

	it('never lends the request fetch for in-process reads', async () => {
		const aide = createAide({ provider, origin: ORIGIN });
		const inProcess = vi.fn();
		vi.stubGlobal('fetch', async () => new Response('Not found', { status: 404 }));
		await aide.chat(new Request(`${ORIGIN}/api/chat?route=/`, { headers: { origin: ORIGIN } }));
		expect(aide.handler.transport.hasInProcessFetch()).toBe(false);
		expect(inProcess).not.toHaveBeenCalled();
	});
});
