import { describe, it, expect, vi } from 'vitest';
import {
	INTERNAL_HEADER,
	INTERNAL_MARKER,
	SERVED_HEADER,
	SERVED_MARKER,
	createTransport,
	type FetchLike
} from '../../../src/lib/site/transport';

interface Call {
	url: string;
	init: RequestInit;
}

type Responder = (url: string) => Response;

/**
 * A fetch spy that records every call and fails on any visitor credential in the request. Its
 * responses carry the hook's served stamp (as in-process responses through `aide()` do) unless
 * `stamp: false`.
 */
function spy(respond: Responder, opts: { forwardCookies?: boolean; stamp?: boolean } = {}) {
	const calls: Call[] = [];
	const fetch: FetchLike = async (input, init = {}) => {
		const url = String(input);
		const headers = new Headers(init.headers);
		// Simulate SvelteKit's event.fetch: forwards the visitor's cookie unless credentials are omitted.
		if (opts.forwardCookies && init.credentials !== 'omit') headers.set('cookie', 'session=secret');
		if (headers.has('cookie') || headers.has('authorization')) throw new Error('credential forwarded');
		calls.push({ url, init });
		const res = respond(url);
		if (opts.stamp !== false) res.headers.set(SERVED_HEADER, SERVED_MARKER);
		return res;
	};
	return { fetch, calls };
}

/** A Response whose `url` is set, as for one fetched over the network. */
function withUrl(res: Response, url: string): Response {
	Object.defineProperty(res, 'url', { value: url });
	return res;
}

const html = (body = '<p>hi</p>', status = 200) =>
	new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
const redirect = (location: string, status = 302) => new Response(null, { status, headers: { location } });

describe('internal marker', () => {
	it('is a random per-process value on the fixed header', () => {
		expect(INTERNAL_HEADER).toBe('x-aide-internal');
		expect(INTERNAL_MARKER).toMatch(/^[0-9a-f-]{36}$/);
	});
});

describe('transport: request shape (acceptance #13)', () => {
	it('sends no cookie, only accept + marker, credentials omit, redirect manual', async () => {
		const { fetch, calls } = spy(() => html(), { forwardCookies: true });
		const t = createTransport({ exclude: [] });
		t.setInProcessFetch(fetch);
		const res = await t.read('/about');
		expect(res).toEqual({ ok: true, status: 200, contentType: 'html', body: '<p>hi</p>', finalRoute: '/about' });
		expect(calls).toHaveLength(1);
		const { url, init } = calls[0]!;
		expect(url).toBe('/about');
		expect(init.credentials).toBe('omit');
		expect(init.redirect).toBe('manual');
		expect(init.headers).toBeInstanceOf(Headers);
		const entries = [...(init.headers as Headers).entries()].sort();
		expect(entries).toEqual([
			['accept', 'text/html'],
			[INTERNAL_HEADER, INTERNAL_MARKER]
		]);
	});

	it('passes a custom accept header', async () => {
		const { fetch, calls } = spy(
			() => new Response('# t', { headers: { 'content-type': 'text/markdown' } })
		);
		const t = createTransport({ exclude: [] });
		t.setInProcessFetch(fetch);
		const res = await t.read('/about.md', 'text/markdown');
		expect(res).toMatchObject({ ok: true, contentType: 'markdown', body: '# t' });
		expect((calls[0]!.init.headers as Headers).get('accept')).toBe('text/markdown');
	});

	it('uses the most recently set in-process fetch', async () => {
		const a = spy(() => html());
		const b = spy(() => html());
		const t = createTransport({ exclude: [] });
		t.setInProcessFetch(a.fetch);
		t.setInProcessFetch(b.fetch);
		await t.read('/');
		expect(a.calls).toHaveLength(0);
		expect(b.calls).toHaveLength(1);
	});
});

describe('transport: content types and status', () => {
	it.each([
		['text/html', 'html'],
		['text/markdown; charset=utf-8', 'markdown'],
		['text/x-markdown', 'markdown'],
		['text/plain', 'text'],
		['TEXT/HTML', 'html']
	])('%s -> %s', async (ct, kind) => {
		const { fetch } = spy(() => new Response('x', { headers: { 'content-type': ct } }));
		const t = createTransport({ exclude: [] });
		t.setInProcessFetch(fetch);
		expect(await t.read('/')).toMatchObject({ ok: true, contentType: kind });
	});

	it('image/png -> miss content-type', async () => {
		const { fetch } = spy(() => new Response('x', { headers: { 'content-type': 'image/png' } }));
		const t = createTransport({ exclude: [] });
		t.setInProcessFetch(fetch);
		expect(await t.read('/')).toEqual({ ok: false, status: 200, reason: 'content-type' });
	});

	it.each(['application/xml', 'text/xml; charset=utf-8'])('%s -> xml only when accept asks for xml', async (ct) => {
		const { fetch } = spy(() => new Response('<urlset/>', { headers: { 'content-type': ct } }));
		const t = createTransport({ exclude: [] });
		t.setInProcessFetch(fetch);
		expect(await t.read('/sitemap.xml')).toMatchObject({ ok: false, reason: 'content-type' });
		expect(await t.read('/sitemap.xml', 'application/xml, text/xml')).toMatchObject({
			ok: true,
			contentType: 'xml',
			body: '<urlset/>'
		});
	});

	it('missing content-type -> miss content-type', async () => {
		const { fetch } = spy(() => new Response(new Uint8Array([1])));
		const t = createTransport({ exclude: [] });
		t.setInProcessFetch(fetch);
		expect(await t.read('/')).toMatchObject({ ok: false, reason: 'content-type' });
	});

	it.each([404, 500, 204, 201])('%i -> miss status', async (status) => {
		const { fetch } = spy(() => html(status === 204 ? null! : 'x', status));
		const t = createTransport({ exclude: [] });
		t.setInProcessFetch(fetch);
		expect(await t.read('/x')).toEqual({ ok: false, status, reason: 'status' });
	});

	it('a throwing fetch -> miss network', async () => {
		const t = createTransport({ exclude: [] });
		t.setInProcessFetch(async () => {
			throw new Error('boom');
		});
		expect(await t.read('/')).toEqual({ ok: false, status: 0, reason: 'network' });
	});
});

describe('transport: redirects (acceptance #26)', () => {
	it('follows a same-site redirect and reports the final route', async () => {
		const { fetch, calls } = spy((url) => (url === '/old' ? redirect('/new') : html()));
		const t = createTransport({ exclude: [] });
		t.setInProcessFetch(fetch);
		expect(await t.read('/old')).toMatchObject({ ok: true, finalRoute: '/new' });
		expect(calls.map((c) => c.url)).toEqual(['/old', '/new']);
		for (const c of calls) expect(c.init.redirect).toBe('manual');
	});

	it('drops query and hash from a followed Location', async () => {
		const { fetch, calls } = spy((url) => (url === '/old' ? redirect('/new?t=secret#x') : html()));
		const t = createTransport({ exclude: [] });
		t.setInProcessFetch(fetch);
		await t.read('/old');
		expect(calls[1]!.url).toBe('/new');
	});

	it('foreign Location -> miss redirect, no second call', async () => {
		const { fetch, calls } = spy(() => redirect('https://evil.example/x'));
		const t = createTransport({ exclude: [] });
		t.setInProcessFetch(fetch);
		expect(await t.read('/x')).toEqual({ ok: false, status: 302, reason: 'redirect' });
		expect(calls).toHaveLength(1);
	});

	it('/go/github -> https://github.com is never fetched (network transport)', async () => {
		const { fetch, calls } = spy((url) =>
			url.endsWith('/go/github') ? redirect('https://github.com/', 301) : html()
		);
		const t = createTransport({ origin: 'https://site.dev', exclude: [], networkFetch: fetch });
		expect(await t.read('/go/github')).toMatchObject({ ok: false, reason: 'redirect' });
		expect(calls.map((c) => c.url)).toEqual(['https://site.dev/go/github']);
		expect(calls.some((c) => c.url.includes('github.com'))).toBe(false);
	});

	it('4 same-site hops -> miss after 3 follows', async () => {
		const { fetch, calls } = spy((url) => {
			const n = Number(url.slice(url.lastIndexOf('/') + 2));
			return redirect(`/h${n + 1}`);
		});
		const t = createTransport({ exclude: [] });
		t.setInProcessFetch(fetch);
		expect(await t.read('/h0')).toMatchObject({ ok: false, reason: 'redirect' });
		expect(calls.map((c) => c.url)).toEqual(['/h0', '/h1', '/h2', '/h3']);
	});

	it('3 same-site hops are followed', async () => {
		const { fetch } = spy((url) => (url === '/h3' ? html() : redirect(`/h${Number(url.slice(2)) + 1}`)));
		const t = createTransport({ exclude: [] });
		t.setInProcessFetch(fetch);
		expect(await t.read('/h0')).toMatchObject({ ok: true, finalRoute: '/h3' });
	});

	it('excluded Location (/logout) -> miss', async () => {
		const { fetch, calls } = spy(() => redirect('/logout'));
		const t = createTransport({ exclude: [] });
		t.setInProcessFetch(fetch);
		expect(await t.read('/account')).toMatchObject({ ok: false, reason: 'redirect' });
		expect(calls).toHaveLength(1);
	});

	it('user-excluded Location -> miss', async () => {
		const { fetch, calls } = spy(() => redirect('/private/x'));
		const t = createTransport({ exclude: ['/private/**'] });
		t.setInProcessFetch(fetch);
		expect(await t.read('/a')).toMatchObject({ ok: false, reason: 'redirect' });
		expect(calls).toHaveLength(1);
	});

	it('3xx without Location -> miss redirect', async () => {
		const { fetch } = spy(() => new Response(null, { status: 302 }));
		const t = createTransport({ exclude: [] });
		t.setInProcessFetch(fetch);
		expect(await t.read('/a')).toMatchObject({ ok: false, reason: 'redirect' });
	});

	it('absolute same-origin Location against the configured origin is followed', async () => {
		const { fetch, calls } = spy((url) => (url === '/a' ? redirect('https://site.dev/b') : html()));
		const t = createTransport({ origin: 'https://site.dev', exclude: [], networkFetch: vi.fn() });
		t.setInProcessFetch(fetch);
		expect(await t.read('/a')).toMatchObject({ ok: true, finalRoute: '/b' });
		expect(calls.map((c) => c.url)).toEqual(['/a', '/b']);
	});
});

describe('transport: origin and network fallback (acceptance #19)', () => {
	it('no origin and no in-process fetch -> miss network, zero global fetch calls', async () => {
		const global = vi.spyOn(globalThis, 'fetch');
		try {
			const t = createTransport({ exclude: [] });
			expect(await t.read('/')).toEqual({ ok: false, status: 0, reason: 'network' });
			expect(global).not.toHaveBeenCalled();
		} finally {
			global.mockRestore();
		}
	});

	it('no origin: an in-process 404 is not retried over the network', async () => {
		const global = vi.spyOn(globalThis, 'fetch');
		try {
			const { fetch } = spy(() => html('x', 404));
			const t = createTransport({ exclude: [] });
			t.setInProcessFetch(fetch);
			expect(await t.read('/pre')).toMatchObject({ ok: false, status: 404, reason: 'status' });
			expect(global).not.toHaveBeenCalled();
		} finally {
			global.mockRestore();
		}
	});

	it('configured origin, no in-process fetch: network hits only origin + path', async () => {
		const { fetch, calls } = spy(() => html(), { forwardCookies: true });
		const t = createTransport({ origin: 'https://site.dev', exclude: [], networkFetch: fetch });
		expect(await t.read('/docs/a')).toMatchObject({ ok: true, finalRoute: '/docs/a' });
		expect(calls.map((c) => c.url)).toEqual(['https://site.dev/docs/a']);
		expect(calls[0]!.init.credentials).toBe('omit');
		expect(calls[0]!.init.redirect).toBe('manual');
	});

	it('configured origin with a trailing slash is normalised', async () => {
		const { fetch, calls } = spy(() => html());
		const t = createTransport({ origin: 'https://site.dev/', exclude: [], networkFetch: fetch });
		await t.read('/a');
		expect(calls[0]!.url).toBe('https://site.dev/a');
	});

	it('in-process 404 (prerendered route) falls back to the network on the configured origin', async () => {
		const inproc = spy(() => html('x', 404));
		const net = spy(() => html('static'));
		const t = createTransport({ origin: 'https://site.dev', exclude: [], networkFetch: net.fetch });
		t.setInProcessFetch(inproc.fetch);
		expect(await t.read('/pre')).toMatchObject({ ok: true, body: 'static' });
		expect(inproc.calls.map((c) => c.url)).toEqual(['/pre']);
		expect(net.calls.map((c) => c.url)).toEqual(['https://site.dev/pre']);
	});

	it('in-process 500 is not retried over the network', async () => {
		const inproc = spy(() => html('x', 500));
		const net = spy(() => html());
		const t = createTransport({ origin: 'https://site.dev', exclude: [], networkFetch: net.fetch });
		t.setInProcessFetch(inproc.fetch);
		expect(await t.read('/x')).toMatchObject({ ok: false, status: 500 });
		expect(net.calls).toHaveLength(0);
	});

	it('forged Host: only the configured origin is ever requested', async () => {
		const { fetch, calls } = spy((url) => {
			if (url.endsWith('/a')) return redirect('/b');
			if (url.endsWith('/b')) return redirect('https://forged.example/c');
			return html();
		});
		const t = createTransport({ origin: 'https://site.dev', exclude: [], networkFetch: fetch });
		await t.read('/a');
		await t.read('/');
		expect(calls.length).toBeGreaterThan(0);
		for (const c of calls) expect(c.url.startsWith('https://site.dev/')).toBe(true);
	});

	it('defaults the network fetch to globalThis.fetch when origin is configured', async () => {
		const global = vi.spyOn(globalThis, 'fetch').mockResolvedValue(html());
		try {
			const t = createTransport({ origin: 'https://site.dev', exclude: [] });
			await t.read('/x');
			expect(global).toHaveBeenCalledTimes(1);
			expect(String(global.mock.calls[0]![0])).toBe('https://site.dev/x');
		} finally {
			global.mockRestore();
		}
	});

	it('refuses a path that is not a plain same-site path', async () => {
		const { fetch, calls } = spy(() => html());
		const t = createTransport({ origin: 'https://site.dev', exclude: [], networkFetch: fetch });
		t.setInProcessFetch(fetch);
		for (const p of ['//evil.example/x', 'https://evil.example/', 'x']) {
			expect(await t.read(p)).toMatchObject({ ok: false });
		}
		expect(calls).toHaveLength(0);
	});
});

describe('transport: forged Host (in-process fetch bound to the configured origin)', () => {
	it('adopts an event fetch only when no origin is configured or the event origin matches', async () => {
		const good = spy(() => html('good'));
		const forged = spy(() => html('forged'));
		const net = spy(() => html('net'));
		const t = createTransport({ origin: 'https://site.dev', exclude: [], networkFetch: net.fetch });
		expect(t.setInProcessFetch(forged.fetch, 'https://evil.example')).toBe(false);
		expect(t.hasInProcessFetch()).toBe(false);
		expect(await t.read('/a')).toMatchObject({ ok: true, body: 'net' });
		expect(forged.calls).toHaveLength(0);

		expect(t.setInProcessFetch(good.fetch, 'https://site.dev')).toBe(true);
		expect(t.hasInProcessFetch()).toBe(true);
		// a later forged event does not replace the adopted fetch
		expect(t.setInProcessFetch(forged.fetch, 'https://evil.example')).toBe(false);
		expect(await t.read('/a')).toMatchObject({ ok: true, body: 'good' });
		expect(forged.calls).toHaveLength(0);

		const open = createTransport({ exclude: [] });
		expect(open.setInProcessFetch(good.fetch, 'https://anything.example')).toBe(true);
	});

	it('configured origin: an in-process response fetched from another origin is refused', async () => {
		const { fetch } = spy(() => withUrl(html('attacker'), 'https://evil.example/pre'));
		const net = spy(() => html('net'));
		const t = createTransport({ origin: 'https://site.dev', exclude: [], networkFetch: net.fetch });
		t.setInProcessFetch(fetch, 'https://site.dev');
		expect(await t.read('/pre')).toEqual({ ok: false, status: 0, reason: 'network' });
	});

	it('configured origin: an in-process response from the configured origin, or internal (no url), is accepted', async () => {
		const own = spy(() => withUrl(html('own'), 'https://site.dev/pre'));
		const t = createTransport({ origin: 'https://site.dev', exclude: [], networkFetch: vi.fn() });
		t.setInProcessFetch(own.fetch, 'https://site.dev');
		expect(await t.read('/pre')).toMatchObject({ ok: true, body: 'own' });

		const internal = spy(() => html('internal'), { stamp: false });
		const u = createTransport({ origin: 'https://site.dev', exclude: [], networkFetch: vi.fn() });
		u.setInProcessFetch(internal.fetch, 'https://site.dev');
		expect(await u.read('/x')).toMatchObject({ ok: true, body: 'internal' });
	});

	it('no origin: any in-process response with a url (a network read) is a network miss', async () => {
		const { fetch } = spy(() => withUrl(html('attacker'), 'http://localhost:5173/pre'));
		const t = createTransport({ exclude: [] });
		t.setInProcessFetch(fetch, 'http://localhost:5173');
		expect(await t.read('/pre')).toEqual({ ok: false, status: 0, reason: 'network' });
	});

	it('no origin: an in-process response without the hook’s served stamp is a network miss', async () => {
		// SvelteKit re-wraps a sub-request's network fallback (unknown route) with an empty url.
		const { fetch } = spy(() => html('attacker'), { stamp: false });
		const t = createTransport({ exclude: [] });
		t.setInProcessFetch(fetch);
		expect(await t.read('/invented')).toEqual({ ok: false, status: 0, reason: 'network' });

		const forged = spy(() => {
			const r = html('attacker');
			r.headers.set(SERVED_HEADER, INTERNAL_MARKER);
			return r;
		}, { stamp: false });
		const u = createTransport({ exclude: [] });
		u.setInProcessFetch(forged.fetch);
		expect(await u.read('/invented')).toEqual({ ok: false, status: 0, reason: 'network' });
	});

	it('the served stamp is a separate random value, never sent on a read', async () => {
		expect(SERVED_HEADER).toBe('x-aide-served');
		expect(SERVED_MARKER).toMatch(/^[0-9a-f-]{36}$/);
		expect(SERVED_MARKER).not.toBe(INTERNAL_MARKER);
		const { fetch, calls } = spy(() => html());
		const t = createTransport({ exclude: [] });
		t.setInProcessFetch(fetch);
		await t.read('/a');
		expect(JSON.stringify([...(calls[0]!.init.headers as Headers).entries()])).not.toContain(SERVED_MARKER);
	});
});
