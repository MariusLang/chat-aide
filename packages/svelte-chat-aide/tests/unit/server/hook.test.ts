import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Handle, RequestEvent } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
// What SvelteKit's server sets up around `handle`; `sequence()` reads it.
// @ts-expect-error -- internal entry; its `types` field points at a file that declares no module.
import { with_request_store } from '@sveltejs/kit/internal/server';
import { MockLanguageModelV4 } from 'ai/test';
import { aide } from '../../../src/lib/server/hook';
import { llmsFullTxt, llmsTxt, pageMarkdown } from '../../../src/lib/llms/index';
import { parseLlmsTxt } from '../../../src/lib/site/llms';
import { INTERNAL_HEADER, INTERNAL_MARKER, SERVED_HEADER, SERVED_MARKER } from '../../../src/lib/site/transport';
import type { AideConfig } from '../../../src/lib/shared/types';
import { htmlPage } from '../../fixtures/site';

const BASE = 'http://localhost:5173';
const LONG = 'This page explains the product in enough words to not be thin at all. '.repeat(5);

type Route = (event: RequestEvent) => Response | Promise<Response>;

function html(body: string): Route {
	return () => new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function defaultRoutes(): Record<string, Route> {
	return {
		'/': html(htmlPage({ title: 'Home', description: 'The home page.', body: LONG, links: ['/docs/a', '/docs/b', '/secret'] })),
		'/docs/a': html(htmlPage({ title: 'Doc A', description: 'First doc.', body: 'Alpha. ' + LONG })),
		'/docs/b': html(htmlPage({ title: 'Doc B', body: 'Beta. ' + LONG })),
		'/secret': html(htmlPage({ title: 'Secret', body: 'Secret. ' + LONG })),
		'/unlinked': html(htmlPage({ title: 'Unlinked', body: 'Nobody links here. ' + LONG }))
	};
}

interface Invocation {
	path: string;
	internal: boolean;
	depth: number;
	resolves: number;
	status?: number;
}

/**
 * A fake SvelteKit app: every request, including `event.fetch` from inside the hook, runs the
 * `handle` again (as SvelteKit does); `resolve` answers from `routes` or 404s.
 */
function createApp(handle: Handle, routes: Record<string, Route> = defaultRoutes()) {
	const invocations: Invocation[] = [];
	const state = { tracing: { record_span: ({ fn }: { fn: (span: unknown) => unknown }) => fn({}) } };

	/** `depth` is how many requests deep this one is: event.fetch from a request is one deeper. */
	async function request(input: string | URL, init?: RequestInit, depth = 0): Promise<Response> {
		const url = new URL(String(input), BASE);
		const req = new Request(url, init);
		const inv: Invocation = {
			path: url.pathname,
			internal: req.headers.get(INTERNAL_HEADER) === INTERNAL_MARKER,
			depth,
			resolves: 0
		};
		invocations.push(inv);
		const event = {
			request: req,
			url,
			params: {},
			route: { id: null },
			fetch: (i: string | URL, o?: RequestInit) => request(i, o, depth + 1),
			getClientAddress: () => '203.0.113.7',
			isSubRequest: depth > 0,
			platform: undefined,
			locals: {}
		} as unknown as RequestEvent;
		const resolve = async (e: RequestEvent) => {
			inv.resolves++;
			const r = routes[e.url.pathname];
			return r ? r(e) : new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
		};
		const res = await with_request_store({ event, state } as never, () =>
			handle({ event, resolve } as Parameters<Handle>[0])
		);
		inv.status = res.status;
		return res;
	}

	return { request: (input: string | URL, init?: RequestInit) => request(input, init), invocations };
}

function config(extra: Partial<AideConfig> = {}): AideConfig {
	return {
		provider: { name: 'custom', model: 'mock', instance: new MockLanguageModelV4() },
		pages: { exclude: ['/secret'] },
		...extra
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('aide() hook', () => {
	it('passes the library’s own reads straight to resolve, even for /llms.txt', async () => {
		const handle = aide(config());
		const app = createApp(handle);
		const res = await app.request('/llms.txt', { headers: { [INTERNAL_HEADER]: INTERNAL_MARKER } });
		expect(res.status).toBe(404);
		expect(app.invocations).toHaveLength(1);
		expect(app.invocations[0]!.resolves).toBe(1);
	});

	it('stamps its answers to the library’s in-process sub-requests only', async () => {
		const handle = aide(config());
		const app = createApp(handle);
		const outside = await app.request('/docs/a', { headers: { [INTERNAL_HEADER]: INTERNAL_MARKER } });
		expect(outside.status).toBe(200);
		expect(outside.headers.has(SERVED_HEADER)).toBe(false);

		const seen: (string | null)[] = [];
		const probe = createApp(async ({ event, resolve }) => {
			if (event.url.pathname === '/probe') {
				const r = await event.fetch('/docs/a', { headers: { [INTERNAL_HEADER]: INTERNAL_MARKER } });
				seen.push(r.headers.get(SERVED_HEADER));
				const plain = await event.fetch('/docs/a');
				seen.push(plain.headers.get(SERVED_HEADER));
				return new Response('ok');
			}
			return handle({ event, resolve });
		});
		await probe.request('/probe');
		expect(seen).toEqual([SERVED_MARKER, null]);
	});

	it('passes every other path through untouched', async () => {
		const app = createApp(aide(config()));
		const res = await app.request('/docs/a');
		expect(res.status).toBe(200);
		expect(await res.text()).toContain('Doc A');
		expect(app.invocations).toHaveLength(1);
	});

	it('never shadows an endpoint the app answers itself, and warns once', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const routes = { ...defaultRoutes(), '/api/chat': () => new Response('mine', { status: 200 }) };
		const app = createApp(aide(config({ endpoint: '/api/chat' })), routes);
		const first = await app.request('/api/chat', { method: 'POST', body: '{}' });
		expect(first.status).toBe(200);
		expect(await first.text()).toBe('mine');
		await app.request('/api/chat', { method: 'POST', body: '{}' });
		const mine = warn.mock.calls.filter((c) => String(c[0]).includes('/api/chat'));
		expect(mine).toHaveLength(1);
	});

	it('answers the endpoint with the chat handler when the app 404s', async () => {
		const handle = aide(config());
		const app = createApp(handle);
		const res = await app.request('/api/chat', { method: 'PUT' });
		expect(res.status).toBe(405);
		expect(await res.json()).toMatchObject({ error: 'method_not_allowed' });
		expect(typeof handle.handler).toBe('function');
		expect(handle.handler.config.endpoint).toBe('/api/chat');
	});

	it('does not shadow an llms.txt the app serves itself', async () => {
		const routes = {
			...defaultRoutes(),
			'/llms.txt': () => new Response('# Own\n', { headers: { 'content-type': 'text/plain' } })
		};
		const app = createApp(aide(config()), routes);
		const res = await app.request('/llms.txt');
		expect(await res.text()).toBe('# Own\n');
	});

	it('serves /llms.txt listing every mapped page and no excluded one (acceptance #17)', async () => {
		const app = createApp(aide(config()));
		const res = await app.request('/llms.txt');
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
		expect(res.headers.get('cache-control')).toMatch(/^public, max-age=\d+$/);
		const text = await res.text();
		const doc = parseLlmsTxt(text);
		expect(doc.title).toBe('Home');
		const urls = doc.links.map((l) => l.url).sort();
		expect(urls).toEqual(['/', '/docs/a', '/docs/b']);
		expect(text).not.toContain('Secret');
		expect(text).not.toContain('/api/chat');
	});

	it('serves /llms-full.txt with every mapped page’s text', async () => {
		const app = createApp(aide(config()));
		const res = await app.request('/llms-full.txt');
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
		const text = await res.text();
		expect(text).toContain('# Doc A');
		expect(text).toContain('Alpha.');
		expect(text).toContain('Beta.');
		expect(text).not.toContain('Secret.');
	});

	it('serves <route>.md for mapped pages only', async () => {
		const app = createApp(aide(config()));
		const a = await app.request('/docs/a.md');
		expect(a.status).toBe(200);
		expect(a.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
		const body = await a.text();
		expect(body).toMatch(/^# Doc A\n/);
		expect(body).toContain('Alpha.');

		const root = await app.request('/index.html.md');
		expect(root.status).toBe(200);
		expect(await root.text()).toMatch(/^# Home\n/);

		expect((await app.request('/secret.md')).status).toBe(404);
		expect((await app.request('/unlinked.md')).status).toBe(404);
		expect((await app.request('/nowhere.md')).status).toBe(404);
	});

	it('llms.serve:false passes the three paths through', async () => {
		const app = createApp(aide(config({ llms: { serve: false } })));
		expect((await app.request('/llms.txt')).status).toBe(404);
		expect((await app.request('/llms-full.txt')).status).toBe(404);
		expect((await app.request('/index.html.md')).status).toBe(404);
	});

	describe('pages.source (acceptance #28)', () => {
		const source = async () => [
			{ route: '/', title: 'CMS Home', headings: [], text: 'Home text from the CMS. ' + LONG },
			{ route: '/cms/draft', title: 'Draft', headings: [], text: 'Draft text. ' + LONG }
		];

		it('keeps source pages off all three documents by default', async () => {
			const app = createApp(aide(config({ pages: { source } })));
			const txt = await (await app.request('/llms.txt')).text();
			expect(txt).not.toContain('/cms/draft');
			expect(parseLlmsTxt(txt).links).toHaveLength(0);
			const full = await (await app.request('/llms-full.txt')).text();
			expect(full).not.toContain('Draft text.');
			expect((await app.request('/cms/draft.md')).status).toBe(404);
		});

		it('serves them once llms.serveSource is true', async () => {
			const app = createApp(aide(config({ pages: { source }, llms: { serveSource: true } })));
			const txt = await (await app.request('/llms.txt')).text();
			expect(parseLlmsTxt(txt).links.map((l) => l.url)).toContain('/cms/draft');
			expect(await (await app.request('/llms-full.txt')).text()).toContain('Draft text.');
			const md = await app.request('/cms/draft.md');
			expect(md.status).toBe(200);
			expect(await md.text()).toContain('Draft text.');
		});
	});

	it('the library’s reads of llms paths reach the app, 404, and never recurse (acceptance #20)', async () => {
		const app = createApp(aide(config()));
		const res = await app.request('/llms.txt');
		expect(res.status).toBe(200);

		const internal = app.invocations.filter((i) => i.internal);
		expect(internal.length).toBeGreaterThan(0);
		// every internal read resolved exactly once, one level deep, and was never answered by the hook
		for (const inv of internal) {
			expect(inv.resolves).toBe(1);
			expect(inv.depth).toBe(1);
		}
		const llmsReads = internal.filter(
			(i) => i.path === '/llms.txt' || i.path === '/llms-full.txt' || i.path.endsWith('.md')
		);
		expect(llmsReads.map((i) => i.path)).toEqual(expect.arrayContaining(['/llms.txt', '/llms-full.txt']));
		expect(llmsReads.some((i) => i.path.endsWith('.md'))).toBe(true);
		for (const inv of llmsReads) expect(inv.status).toBe(404);
		expect(Math.max(...app.invocations.map((i) => i.depth))).toBe(1);
	});

	it('forged Host: the event’s fetch is not adopted, reads go to the configured origin', async () => {
		let app: ReturnType<typeof createApp> | undefined = undefined;
		const network: string[] = [];
		const handle = aide(config({ origin: BASE }), {
			fetch: (url, init) => {
				network.push(String(url));
				return app!.request(url, init);
			}
		});
		app = createApp(handle);
		const res = await app.request('http://evil.example/llms.txt');
		expect(res.status).toBe(200);
		expect(network.length).toBeGreaterThan(0);
		for (const u of network) expect(u.startsWith(BASE + '/')).toBe(true);
		expect(handle.handler.transport.hasInProcessFetch()).toBe(false);

		network.length = 0;
		await app.request('/api/chat?route=/', { headers: { 'sec-fetch-site': 'same-origin' } });
		expect(handle.handler.transport.hasInProcessFetch()).toBe(true);
	});

	it('only the chat endpoint replaces the adopted fetch; llms paths adopt one only when none is', async () => {
		const handle = aide(config());
		const set = vi.spyOn(handle.handler.transport, 'setInProcessFetch');
		const app = createApp(handle);
		await app.request('/llms.txt');
		expect(set).toHaveBeenCalledTimes(1);
		await app.request('/llms-full.txt');
		await app.request('/docs/a.md');
		expect(set).toHaveBeenCalledTimes(1);
		await app.request('/api/chat?route=/', { headers: { 'sec-fetch-site': 'same-origin' } });
		expect(set).toHaveBeenCalledTimes(2);
		await app.request('/llms.txt');
		expect(set).toHaveBeenCalledTimes(2);
	});

	it('llms paths charge the warm-up rate-limit bucket and answer 429 rate_limited past it', async () => {
		const onRefused = vi.fn();
		const handle = aide(config({ rateLimit: { warmups: 2 }, onRefused }));
		const app = createApp(handle);
		expect((await app.request('/llms.txt')).status).toBe(200);
		expect((await app.request('/docs/a.md')).status).toBe(200);
		const third = await app.request('/llms-full.txt');
		expect(third.status).toBe(429);
		expect(third.headers.get('content-type')).toMatch(/^application\/json/);
		expect(await third.json()).toEqual({ error: 'rate_limited', message: expect.any(String) });
		expect(onRefused).toHaveBeenCalledWith(expect.objectContaining({ code: 'rate_limited' }));
		// The warm-up GET shares the bucket.
		const warm = await app.request('/api/chat?route=/', { headers: { 'sec-fetch-site': 'same-origin' } });
		expect(warm.status).toBe(429);
	});

	it('a rate-limited llms request does not start the crawl', async () => {
		const handle = aide(config({ rateLimit: { warmups: 1 } }));
		const app = createApp(handle);
		await app.request('/api/chat?route=/', { headers: { 'sec-fetch-site': 'same-origin' } });
		const start = vi.spyOn(handle.handler.siteMap, 'ensureStarted');
		expect((await app.request('/llms.txt')).status).toBe(429);
		expect(start).not.toHaveBeenCalled();
	});

	it('composes with sequence()', async () => {
		const seen: string[] = [];
		const other: Handle = async ({ event, resolve }) => {
			seen.push(event.url.pathname);
			const res = await resolve(event);
			res.headers.set('x-other', '1');
			return res;
		};
		const app = createApp(sequence(aide(config()), other));
		const page = await app.request('/docs/a');
		expect(page.headers.get('x-other')).toBe('1');
		const llms = await app.request('/llms.txt');
		expect(llms.status).toBe(200);
		expect(parseLlmsTxt(await llms.text()).links.length).toBeGreaterThan(0);
		expect(seen).toContain('/docs/a');
		expect(seen).toContain('/llms.txt');
	});
});

describe('llms handlers', () => {
	it('are RequestHandlers bound to a chat handler', async () => {
		// Mounted by hand, reads go over the network to the configured origin (here: the app).
		let app: ReturnType<typeof createApp> | undefined = undefined;
		const handle = aide(config({ origin: BASE }), { fetch: (url, init) => app!.request(url, init) });
		// A hand-mounted app: its own reads must still reach "the app", so they skip the handlers.
		app = createApp(async ({ event, resolve }) => {
			if (event.request.headers.get(INTERNAL_HEADER)) return resolve(event);
			const path = event.url.pathname;
			if (path === '/llms.txt') return llmsTxt(handle.handler)(event as never);
			if (path === '/llms-full.txt') return llmsFullTxt(handle.handler)(event as never);
			if (path.endsWith('.md')) return pageMarkdown(handle.handler)(event as never);
			return resolve(event);
		});
		expect((await app.request('/llms.txt')).status).toBe(200);
		expect((await app.request('/llms-full.txt')).status).toBe(200);
		expect((await app.request('/docs/b.md')).status).toBe(200);
		expect((await app.request('/secret.md')).status).toBe(404);
	});
});

describe('mounted by hand (not through aide())', () => {
	it('never adopts the event’s fetch, so no read’s Set-Cookie reaches the visitor', async () => {
		const handle = aide(config({ origin: BASE }), {
			fetch: async () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } })
		});
		const eventFetch = vi.fn(async () => new Response('x', { headers: { 'set-cookie': 'a=b' } }));
		const event = {
			request: new Request(BASE + '/llms.txt'),
			url: new URL(BASE + '/llms.txt'),
			params: {},
			fetch: eventFetch,
			getClientAddress: () => '203.0.113.7',
			isSubRequest: false,
			platform: undefined,
			locals: {}
		} as unknown as RequestEvent;
		const res = await llmsTxt(handle.handler)(event as never);
		expect(res.status).toBe(200);
		expect(eventFetch).not.toHaveBeenCalled();
		expect(handle.handler.transport.hasInProcessFetch()).toBe(false);
	});

	it('with no origin, warns once that direct mounting needs one, and reads nothing', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const handle = aide(config());
		const eventFetch = vi.fn();
		const event = (path: string) =>
			({
				request: new Request(BASE + path),
				url: new URL(BASE + path),
				params: {},
				fetch: eventFetch,
				getClientAddress: () => '203.0.113.7',
				isSubRequest: false,
				platform: undefined,
				locals: {}
			}) as unknown as RequestEvent;
		expect((await llmsTxt(handle.handler)(event('/llms.txt') as never)).status).toBe(200);
		expect((await llmsFullTxt(handle.handler)(event('/llms-full.txt') as never)).status).toBe(200);
		expect(eventFetch).not.toHaveBeenCalled();
		const mine = warn.mock.calls.filter((c) => /mounted directly|mounted by hand/.test(String(c[0])));
		expect(mine).toHaveLength(1);
		expect(String(mine[0]![0])).toContain('origin');
	});
});
