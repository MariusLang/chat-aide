import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vitest';

const afterTasks: Array<() => unknown> = [];
vi.mock('next/server.js', () => ({ after: (task: () => unknown) => void afterTasks.push(task) }));

const { createAide } = await import('../src/index.js');

const ORIGIN = 'https://example.test';
const USAGE = {
	inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
	outputTokens: { total: 1, text: 1, reasoning: undefined }
};

function model(text: string) {
	return new MockLanguageModelV4({
		doStream: async () => ({
			stream: simulateReadableStream({
				chunks: [
					{ type: 'stream-start', warnings: [] },
					{ type: 'text-start', id: 't' },
					{ type: 'text-delta', id: 't', delta: text },
					{ type: 'text-end', id: 't' },
					{ type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: USAGE }
				] as never[]
			})
		})
	});
}

/** The site, read over the network from the origin. */
const site: Record<string, string> = {
	'/': '<html><head><title>Home</title></head><body><main><h1>Home</h1><p>Welcome to the example shop.</p><a href="/pricing">Pricing</a></main></body></html>',
	'/pricing': '<html><head><title>Pricing</title></head><body><main><h1>Pricing</h1><p>Shipping is free over 50 euros.</p></main></body></html>'
};

function networkFetch(): typeof fetch {
	return (async (input: RequestInfo | URL) => {
		const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
		const body = url.origin === ORIGIN ? site[url.pathname] : undefined;
		return body
			? new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } })
			: new Response('Not found', { status: 404 });
	}) as typeof fetch;
}

afterEach(() => {
	vi.unstubAllGlobals();
	afterTasks.length = 0;
});

describe('@chat-aide/next', () => {
	it('creates the handler from a factory only on the first request', async () => {
		const factory = vi.fn(() => ({ provider: { name: 'custom', model: 'm', instance: model('x') }, origin: ORIGIN }));
		const aide = createAide(factory);
		expect(factory).not.toHaveBeenCalled();
		const res = await aide.chat.GET(new Request(`${ORIGIN}/api/chat?route=/`, { headers: { origin: 'https://evil.test' } }));
		expect(res.status).toBe(403);
		expect(factory).toHaveBeenCalledTimes(1);
		await aide.chat.GET(new Request(`${ORIGIN}/api/chat?route=/`, { headers: { origin: 'https://evil.test' } }));
		expect(factory).toHaveBeenCalledTimes(1);
	});

	it('requires origin', () => {
		expect(() => createAide({ provider: { name: 'custom', model: 'm', instance: model('x') } })).toThrow(/origin is required/);
	});

	it('answers the warm-up and a chat turn through the route handlers', async () => {
		vi.stubGlobal('fetch', networkFetch());
		const aide = createAide({ provider: { name: 'custom', model: 'm', instance: model('Free over 50 euros.') }, origin: ORIGIN });
		const headers = { origin: ORIGIN, 'x-real-ip': '203.0.113.7' };

		const warm = await aide.chat.GET(new Request(`${ORIGIN}/api/chat?route=/pricing`, { headers }));
		expect(warm.status).toBe(200);
		expect(await warm.json()).toHaveProperty('pageSource');

		const turn = await aide.chat.POST(
			new Request(`${ORIGIN}/api/chat`, {
				method: 'POST',
				headers: { ...headers, 'content-type': 'application/json' },
				body: JSON.stringify({
					id: 'c1',
					trigger: 'submit-message',
					messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Is shipping free?' }] }],
					aide: { route: '/pricing', sessionId: 's1', dom: null }
				})
			})
		);
		expect(turn.status).toBe(200);
		expect(await turn.text()).toContain('Free over 50 euros.');
		// The crawl and callbacks were handed to after().
		expect(afterTasks.length).toBeGreaterThan(0);
	});

	it('refuses a cross-site request', async () => {
		const aide = createAide({ provider: { name: 'custom', model: 'm', instance: model('x') }, origin: ORIGIN });
		const res = await aide.chat.GET(new Request(`${ORIGIN}/api/chat?route=/`, { headers: { origin: 'https://evil.test' } }));
		expect(res.status).toBe(403);
		expect(await res.json()).toMatchObject({ error: 'origin_refused' });
	});

	it('serves llms.txt from the site map, read over the network', async () => {
		vi.stubGlobal('fetch', networkFetch());
		const aide = createAide({ provider: { name: 'custom', model: 'm', instance: model('x') }, origin: ORIGIN });
		const res = await aide.llmsTxt.GET(new Request(`${ORIGIN}/llms.txt`, { headers: { 'x-real-ip': '203.0.113.7' } }));
		expect(res.status).toBe(200);
		const text = await res.text();
		expect(text).toContain('[Pricing](/pricing)');
	});

	it("answers the library's own reads of llms.txt with 404, so it never reads itself", async () => {
		const aide = createAide({ provider: { name: 'custom', model: 'm', instance: model('x') }, origin: ORIGIN });
		const res = await aide.llmsTxt.GET(new Request(`${ORIGIN}/llms.txt`, { headers: { 'x-aide-internal': '1' } }));
		expect(res.status).toBe(404);
	});
});
