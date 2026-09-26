import { describe, it, expect } from 'vitest';
import { createReader } from '../../../src/lib/site/read-page';
import { createTransport } from '../../../src/lib/site/transport';
import { createPageCache } from '../../../src/lib/site/cache';
import { acceptHref } from '../../../src/lib/site/route';
import { LIMIT_DEFAULTS, type Limits } from '../../../src/lib/shared/limits';
import { createFakeSite, htmlPage, type FakePage } from '../../fixtures/site';

function setup(
	pages: Record<string, FakePage>,
	o: { preferMarkdown?: boolean; limits?: Partial<Limits>; latency?: number } = {}
) {
	let t = 1_000_000;
	const now = () => t;
	const limits = { ...LIMIT_DEFAULTS, ...o.limits };
	const site = createFakeSite(pages, { latency: o.latency });
	const transport = createTransport({ exclude: [] });
	transport.setInProcessFetch(site.fetch);
	const cache = createPageCache({ maxPages: limits.maxPages, ttlSeconds: 3600, now });
	const reader = createReader({ transport, cache, limits, preferMarkdown: o.preferMarkdown ?? false, now });
	return { site, cache, reader, advance: (ms: number) => (t += ms) };
}

const md = (body: string): FakePage => ({ type: 'text/markdown; charset=utf-8', body });

describe('readPage: HTML', () => {
	it('renders through the transport, extracts and caches', async () => {
		const { site, reader } = setup({
			'/about': { body: htmlPage({ title: 'About', description: 'Who we are', body: 'x'.repeat(300) }) }
		});
		const entry = await reader.readPage('/about');
		expect(entry).toMatchObject({
			route: '/about',
			title: 'About',
			description: 'Who we are',
			source: 'render',
			thin: false,
			fetchedAt: 1_000_000
		});
		expect(entry!.headings).toEqual([{ level: 1, text: 'About' }]);
		expect(entry!.hash).toMatch(/^[0-9a-f]{16}$/);
		expect(await reader.readPage('/about')).toEqual(entry);
		expect(site.paths()).toEqual(['/about']);
		expect(site.violations).toEqual([]);
	});

	it('marks a short page thin and truncates text to pageChars', async () => {
		const { reader } = setup(
			{ '/a': { body: htmlPage({ title: 'A', body: 'y'.repeat(500) }) }, '/b': { body: htmlPage({ title: 'B' }) } },
			{ limits: { pageChars: 100 } }
		);
		const a = await reader.readPage('/a');
		expect(a!.text.length).toBe(100);
		expect((await reader.readPage('/b'))!.thin).toBe(true);
	});

	it('shares one read between concurrent callers', async () => {
		const { site, reader } = setup({ '/x': { body: htmlPage({ title: 'X' }), delay: 10 } });
		const [a, b, c] = await Promise.all([reader.readPage('/x'), reader.readPage('/x'), reader.readPage('/x')]);
		expect(a).toBe(b);
		expect(b).toBe(c);
		expect(site.calls).toHaveLength(1);
	});

	it('caches a 404 as a miss for 60 s (one render per minute)', async () => {
		const { site, reader, advance } = setup({});
		expect(await reader.readPage('/nope')).toBeNull();
		expect(await reader.readPage('/nope')).toBeNull();
		advance(59_000);
		expect(await reader.readPage('/nope')).toBeNull();
		expect(site.calls).toHaveLength(1);
		advance(2_000);
		expect(await reader.readPage('/nope')).toBeNull();
		expect(site.calls).toHaveLength(2);
	});

	it('treats a non-HTML answer as a miss', async () => {
		const { reader, cache } = setup({ '/data': { type: 'application/json', body: '{}' } });
		expect(await reader.readPage('/data')).toBeNull();
		expect(await cache.get('/data')).toEqual({ miss: true });
	});

	it('keeps the cache at maxPages under a stream of invented routes (acceptance #27)', async () => {
		const { cache, reader } = setup({}, { limits: { maxPages: 20 } });
		for (let i = 0; i < 500; i++) await reader.readPage(`/invented-${i}`);
		expect(cache.size()).toBeLessThanOrEqual(20);
	});

	it('serves a stale entry at once and refreshes it in the background via waitUntil', async () => {
		let version = 1;
		const { site, reader, advance, cache } = setup({
			'/p': { body: () => htmlPage({ title: `P${version}` }) }
		});
		expect((await reader.readPage('/p'))!.title).toBe('P1');
		version = 2;
		advance(3_601_000);
		const handed: Promise<unknown>[] = [];
		const stale = await reader.readPage('/p', { waitUntil: (p) => handed.push(p) });
		expect(stale!.title).toBe('P1');
		expect(handed).toHaveLength(1);
		await handed[0];
		expect(site.calls).toHaveLength(2);
		const fresh = await cache.get('/p');
		expect(fresh).toMatchObject({ stale: false, entry: { title: 'P2' } });
	});

	it('records a miss when a background refresh answers 5xx', async () => {
		const { reader, advance, cache, site } = setup({ '/p': { body: htmlPage({ title: 'P' }) } });
		await reader.readPage('/p');
		site.set('/p', { status: 500 });
		advance(3_601_000);
		const handed: Promise<unknown>[] = [];
		await reader.readPage('/p', { waitUntil: (p) => handed.push(p) });
		await handed[0];
		// A 5xx is a miss like any other: the page is gone for a minute.
		expect(await cache.get('/p')).toEqual({ miss: true });
	});
});

describe('readPage: markdown twins', () => {
	it('uses <route>.md when present and never requests the HTML', async () => {
		const { site, reader } = setup(
			{
				'/guide': { body: htmlPage({ title: 'Guide HTML' }) },
				'/guide.md': md('# Guide\n\n> The guide.\n\n## Install\n\nRun it.\n\n### Deep\n\ntext')
			},
			{ preferMarkdown: true }
		);
		const entry = await reader.readPage('/guide');
		expect(entry).toMatchObject({ route: '/guide', title: 'Guide', description: 'The guide.', source: 'markdown' });
		expect(entry!.headings).toEqual([
			{ level: 1, text: 'Guide' },
			{ level: 2, text: 'Install' },
			{ level: 3, text: 'Deep' }
		]);
		expect(entry!.text).toContain('Run it.');
		expect(site.paths()).toEqual(['/guide.md']);
		expect(site.calls[0]!.accept).toContain('text/markdown');
		expect(site.htmlReads()).toEqual([]);
	});

	it('reads the root twin at /index.html.md', async () => {
		const { site, reader } = setup({ '/index.html.md': md('# Home\n\ntext') }, { preferMarkdown: true });
		expect((await reader.readPage('/'))!.source).toBe('markdown');
		expect(site.paths()).toEqual(['/index.html.md']);
	});

	it('falls back to HTML when the twin is missing or not markdown', async () => {
		const { site, reader } = setup(
			{ '/a': { body: htmlPage({ title: 'A' }) }, '/a.md': { body: htmlPage({ title: 'catch-all' }) } },
			{ preferMarkdown: true }
		);
		expect((await reader.readPage('/a'))!).toMatchObject({ title: 'A', source: 'render' });
		expect(site.paths()).toEqual(['/a.md', '/a']);
	});

	it('does not ask for twins when preferMarkdown is off', async () => {
		const { site, reader } = setup({ '/a': { body: htmlPage({ title: 'A' }) }, '/a.md': md('# A') });
		expect((await reader.readPage('/a'))!.source).toBe('render');
		expect(site.paths()).toEqual(['/a']);
	});
});

describe('reader.links', () => {
	it('returns hrefs of the last HTML read, skipping nofollow, relative ones made root-relative', async () => {
		const { reader } = setup({
			'/docs/intro': {
				body: htmlPage({
					title: 'Intro',
					links: [
						'/pricing',
						'next',
						'../blog?page=2#top',
						{ href: '/logout', rel: 'nofollow' },
						{ href: '/secret', rel: 'external NoFollow' },
						'https://elsewhere.example/x',
						'#local',
						'mailto:a@b.c'
					]
				})
			}
		});
		expect(reader.links('/docs/intro')).toEqual([]);
		await reader.readPage('/docs/intro');
		expect(reader.links('/docs/intro')).toEqual([
			'/pricing',
			'/docs/next',
			'/blog?page=2#top',
			'https://elsewhere.example/x',
			'/docs/intro#local',
			'mailto:a@b.c'
		]);
	});

	it('collects links from a markdown twin, mapping .md links to their routes', async () => {
		const { reader } = setup(
			{ '/a.md': md('# A\n\nSee [B](/b.md), [C](/c) and [root](/index.html.md).') },
			{ preferMarkdown: true }
		);
		await reader.readPage('/a');
		expect(reader.links('/a')).toEqual(['/b', '/c', '/']);
	});

	it('maps encoded and absolute .md links to routes that the route rule then judges decoded', async () => {
		const { reader } = setup(
			{
				'/a.md': md(
					'# A\n\n[1](/%61pi/secret.md) [2](/docs/%6cogout.md) [3](/docs/%zz.md) [4](/docs/%C3%BCber.md)' +
						' [5](https://site.example/abs.md?x#y) [6](https://site.example/index.html.md) [7](https://evil.example/e.md)'
				)
			},
			{ preferMarkdown: true }
		);
		await reader.readPage('/a');
		const links = reader.links('/a');
		expect(links).toEqual([
			'/%61pi/secret',
			'/docs/%6cogout',
			'/docs/%zz',
			'/docs/%C3%BCber',
			'https://site.example/abs?x#y',
			'https://site.example/',
			'https://evil.example/e'
		]);
		const site = { origin: 'https://site.example', base: 'https://site.example/a', exclude: [] };
		expect(links.map((l) => acceptHref(l, site))).toEqual([null, null, null, '/docs/%C3%BCber', '/abs', '/', null]);
	});
});
