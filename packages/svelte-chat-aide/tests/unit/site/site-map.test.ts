import { describe, it, expect } from 'vitest';
import { createSiteMap } from '../../../src/lib/site/site-map';
import { createReader } from '../../../src/lib/site/read-page';
import { createTransport } from '../../../src/lib/site/transport';
import { createPageCache } from '../../../src/lib/site/cache';
import { resolveConfig } from '../../../src/lib/shared/schemas';
import type { Page } from '../../../src/lib/shared/types';
import { createFakeSite, htmlPage, type FakePage } from '../../fixtures/site';

const provider = { name: 'anthropic', model: 'm', apiKey: 'k' };

function setup(pages: Record<string, FakePage>, config: Record<string, unknown> = {}, o: { latency?: number } = {}) {
	let t = 1_000_000;
	const now = () => t;
	const resolved = resolveConfig({ provider, ...config });
	const site = createFakeSite(pages, { latency: o.latency });
	const transport = createTransport({
		origin: resolved.origin,
		exclude: resolved.pages.exclude,
		networkFetch: site.fetch
	});
	transport.setInProcessFetch(site.fetch);
	const cache = createPageCache({ maxPages: resolved.limits.maxPages, ttlSeconds: resolved.cache.ttlSeconds, now });
	const reader = createReader({
		transport,
		cache,
		limits: resolved.limits,
		preferMarkdown: resolved.llms.preferMarkdown,
		now
	});
	const map = createSiteMap({ reader, transport, cache, config: resolved, now });
	const handed: Promise<unknown>[] = [];
	const waitUntil = (p: Promise<unknown>) => void handed.push(p);
	/** Start the crawl and wait for every background promise handed out so far. */
	async function crawl() {
		map.ensureStarted(waitUntil);
		await Promise.all(handed);
	}
	return { site, cache, reader, map, handed, waitUntil, crawl, advance: (ms: number) => (t += ms) };
}

const text = (body: string): FakePage => ({ type: 'text/plain; charset=utf-8', body });
const md = (body: string): FakePage => ({ type: 'text/markdown', body });
const xml = (body: string): FakePage => ({ type: 'application/xml', body });

/** `count` pages /p0.. each linking to the next three, all linked from `/`. */
function chain(count: number): Record<string, FakePage> {
	const pages: Record<string, FakePage> = {
		'/': { body: htmlPage({ title: 'Home', links: Array.from({ length: count }, (_, i) => `/p${i}`) }) }
	};
	for (let i = 0; i < count; i++) {
		pages[`/p${i}`] = { body: htmlPage({ title: `P${i}`, links: [`/p${i + 1}`, `/p${i + 2}`, `/q${i}`] }) };
		pages[`/q${i}`] = { body: htmlPage({ title: `Q${i}` }) };
	}
	return pages;
}

describe('site map: crawl bounds', () => {
	it('stops at maxPages', async () => {
		const { site, map, crawl } = setup(chain(30), { limits: { maxPages: 5 } });
		await crawl();
		expect(map.complete()).toBe(true);
		expect(map.pages().length).toBeLessThanOrEqual(5);
		expect(new Set(site.htmlReads()).size).toBeLessThanOrEqual(5);
		expect(map.pages()[0]!.route).toBe('/');
	});

	it('never has more than crawlConcurrency reads in flight', async () => {
		const { site, map, crawl } = setup(chain(20), { limits: { crawlConcurrency: 3 } }, { latency: 3 });
		await crawl();
		expect(map.pages().length).toBe(41);
		expect(site.inFlightMax).toBe(3);
	});

	it('records no URL with a query or hash and reads a page once however it is linked', async () => {
		const { site, crawl } = setup({
			'/': { body: htmlPage({ title: 'Home', links: ['/blog?page=2', '/blog?sort=new#top', '/blog#x', '/blog?t=abc'] }) },
			'/blog': { body: htmlPage({ title: 'Blog', links: ['/blog?page=3', '?page=4'] }) }
		});
		await crawl();
		expect(site.paths().filter((p) => /[?#]/.test(p))).toEqual([]);
		expect(site.htmlReads().filter((p) => p === '/blog')).toHaveLength(1);
	});

	it('follows no side-effect, api, file or nofollow link (acceptance #21)', async () => {
		const { site, map, crawl } = setup(
			{
				'/': {
					body: htmlPage({
						title: 'Home',
						links: [
							'/logout',
							'/account/delete',
							'/list/remove',
							'/sign-out',
							'/unsubscribe',
							'/api/x',
							'/file.pdf',
							{ href: '/private', rel: 'nofollow' },
							'/drafts/one',
							'/ok'
						]
					})
				},
				'/ok': { body: htmlPage({ title: 'OK' }) }
			},
			{ pages: { exclude: ['/drafts/**'] } }
		);
		await crawl();
		const forbidden = ['/logout', '/account/delete', '/list/remove', '/sign-out', '/unsubscribe', '/api/x', '/file.pdf', '/private', '/drafts/one'];
		for (const p of forbidden) {
			expect(site.paths().some((x) => x.startsWith(p))).toBe(false);
		}
		expect(map.isMapped('/ok')).toBe(true);
		expect(map.isMapped('/logout')).toBe(false);
	});
});

describe('site map: seeds', () => {
	it('reads sitemap <loc>s on the configured origin and ignores foreign ones', async () => {
		const { site, map, crawl } = setup(
			{
				'/': { body: htmlPage({ title: 'Home' }) },
				'/sitemap.xml': xml(
					'<?xml version="1.0"?><urlset><url><loc>https://site.example/from-sitemap?x=1</loc></url>' +
						'<url><loc> https://evil.example/stolen </loc></url><url><loc>http://site.example/wrong-scheme</loc></url>' +
						'<url><loc>https://site.example/a&amp;b</loc></url></urlset>'
				),
				'/from-sitemap': { body: htmlPage({ title: 'From sitemap' }) },
				'/stolen': { body: htmlPage({ title: 'Stolen' }) }
			},
			{ origin: 'https://site.example' }
		);
		await crawl();
		expect(site.calls.find((c) => c.path === '/sitemap.xml')!.accept).toMatch(/xml/);
		expect(map.isMapped('/from-sitemap')).toBe(true);
		expect(site.paths()).not.toContain('/stolen');
		expect(site.paths()).not.toContain('/wrong-scheme');
		expect(site.calls.every((c) => !c.url.includes('evil'))).toBe(true);
		expect(site.paths()).toContain('/a&b');
	});

	it('seeds pages.include', async () => {
		const { map, crawl } = setup(
			{ '/': { body: htmlPage({ title: 'Home' }) }, '/hidden': { body: htmlPage({ title: 'Hidden' }) } },
			{ pages: { include: ['/hidden', '/api/nope'] } }
		);
		await crawl();
		expect(map.pages().map((p) => p.route)).toEqual(['/', '/hidden']);
	});
});

describe('site map: llms.txt', () => {
	const llms = [
		'# Acme Docs',
		'',
		'> Everything about Acme.',
		'',
		'## Docs',
		'',
		'- [Guide](/guide): How to start',
		'- [API](https://elsewhere.example/api): External',
		'- [Logout](/logout)',
		'',
		'## Optional',
		'',
		'- [Changelog](/changelog): What changed',
		''
	].join('\n');

	it('gives a complete outline before any page render (acceptance #16)', async () => {
		const ref = {} as { map: ReturnType<typeof setup>['map'] };
		const completeAtRender: boolean[] = [];
		const page = (title: string): FakePage => ({
			body: () => {
				completeAtRender.push(ref.map.complete());
				return htmlPage({ title });
			}
		});
		const s = setup({
			'/llms.txt': text(llms),
			'/': page('Home'),
			'/guide': page('Guide'),
			'/changelog': page('Changelog')
		});
		ref.map = s.map;
		s.map.ensureStarted(s.waitUntil);
		await s.map.waitFor(1000);
		expect(s.map.complete()).toBe(true);
		const outline = s.map.outline(6000);
		expect(outline.partial).toBe(false);
		expect(outline.text).toContain('# Acme Docs');
		expect(outline.text).toContain('- [Guide](/guide): How to start');
		expect(outline.text).toContain('[Changelog](/changelog)');
		expect(s.map.site()).toEqual({ title: 'Acme Docs', summary: 'Everything about Acme.' });
		expect(s.site.htmlReads()).toEqual([]);
		await Promise.all(s.handed);
		expect(completeAtRender.length).toBeGreaterThan(0);
		expect(completeAtRender.every(Boolean)).toBe(true);
		expect(s.site.calls.find((c) => c.path === '/llms.txt')!.accept).toMatch(/text\/plain/);
		expect(s.site.paths()).not.toContain('/logout');
	});

	it('maps llms links in the author order, Optional last, with their descriptions', async () => {
		const { map, crawl } = setup({
			'/llms.txt': text(llms),
			'/guide': { body: htmlPage({ title: 'Guide page' }) },
			'/changelog': { body: htmlPage({ title: 'Changelog page' }) }
		});
		await crawl();
		const routes = map.pages().map((p) => p.route);
		expect(routes.indexOf('/guide')).toBeLessThan(routes.indexOf('/changelog'));
		expect(map.pages().find((p) => p.route === '/guide')!.description).toBe('How to start');
		expect(routes).not.toContain('/logout');
	});

	it('splits llms-full.txt into the cache so readForTool makes no request', async () => {
		const full = [
			'# Acme Docs',
			'',
			'# Guide',
			'Source: /guide',
			'',
			'Start here.',
			'',
			'## Install',
			'',
			'# Orphan',
			'',
			'no route',
			'',
			'# Foreign',
			'Source: https://elsewhere.example/x',
			'',
			'nope'
		].join('\n');
		const { site, map, crawl } = setup({
			'/llms.txt': text(llms),
			'/llms-full.txt': text(full),
			'/guide': { body: htmlPage({ title: 'Guide HTML' }) }
		});
		await crawl();
		const before = site.calls.length;
		const entry = await map.readForTool('/guide');
		expect(entry).toMatchObject({ route: '/guide', title: 'Guide', source: 'llms-full' });
		expect(entry!.text).toContain('Start here.');
		expect(entry!.headings).toContainEqual({ level: 2, text: 'Install' });
		expect(site.calls.length).toBe(before);
		expect(site.paths()).not.toContain('/guide');
		expect(site.paths()).not.toContain('/x');
	});

	it('uses a .md twin for a page and never requests its HTML', async () => {
		const { site, map, crawl } = setup({
			'/': { body: htmlPage({ title: 'Home', links: ['/guide'] }) },
			'/guide': { body: htmlPage({ title: 'Guide HTML' }) },
			'/guide.md': md('# Guide\n\nFrom markdown.')
		});
		await crawl();
		expect(await map.readForTool('/guide')).toMatchObject({ source: 'markdown', title: 'Guide' });
		expect(site.htmlReads()).not.toContain('/guide');
	});

	it('on a site without llms files reads each once, with the marker, and gets 404 (acceptance #20)', async () => {
		const { site, map, crawl, waitUntil } = setup({ '/': { body: htmlPage({ title: 'Home' }) } });
		await crawl();
		map.ensureStarted(waitUntil);
		await map.waitFor(100);
		expect(site.paths().filter((p) => p === '/llms.txt')).toHaveLength(1);
		expect(site.paths().filter((p) => p === '/llms-full.txt')).toHaveLength(1);
		expect(map.site().title).toBe('Home');
		expect(site.violations).toEqual([]);
	});

	it('reads no llms file when llms.read is false', async () => {
		const { site, crawl } = setup({ '/': { body: htmlPage({ title: 'Home' }) }, '/llms.txt': text(llms) }, { llms: { read: false } });
		await crawl();
		expect(site.paths()).not.toContain('/llms.txt');
	});
});

describe('site map: readForTool', () => {
	it('reads an unknown route once and remembers the miss', async () => {
		const { site, map, crawl } = setup({ '/': { body: htmlPage({ title: 'Home' }) } });
		await crawl();
		expect(await map.readForTool('/unknown')).toBeNull();
		expect(await map.readForTool('/unknown')).toBeNull();
		expect(site.paths().filter((p) => p === '/unknown')).toHaveLength(1);
	});

	it('refuses excluded and malformed routes without a request', async () => {
		const { site, map, crawl } = setup({ '/': { body: htmlPage({ title: 'Home' }) } });
		await crawl();
		const before = site.calls.length;
		expect(await map.readForTool('/logout')).toBeNull();
		expect(await map.readForTool('//evil.example/x')).toBeNull();
		expect(await map.readForTool('/api/secret')).toBeNull();
		expect(site.calls.length).toBe(before);
	});
});

describe('site map: pages.source', () => {
	const sourcePages: Page[] = [
		{ route: '/', title: 'CMS Home', description: 'From the CMS', headings: [], text: 'home text' },
		{ route: '/cms/a', title: 'A', headings: [{ level: 2, text: 'Part' }], text: 'a text' },
		{ route: 'not-a-route', title: 'Bad', headings: [], text: '' }
	];

	it('makes no request at all and serves pages from the source', async () => {
		const { site, map, crawl } = setup({}, { pages: { source: async () => sourcePages } });
		await crawl();
		await map.waitFor(100);
		expect(site.calls).toEqual([]);
		expect(map.complete()).toBe(true);
		expect(map.pages().map((p) => [p.route, p.fromSource])).toEqual([
			['/', true],
			['/cms/a', true]
		]);
		expect(await map.readForTool('/cms/a')).toMatchObject({ route: '/cms/a', text: 'a text', source: 'source' });
		expect(await map.readForTool('/elsewhere')).toBeNull();
		expect(map.site()).toEqual({ title: 'CMS Home', summary: 'From the CMS' });
		expect(map.outline(6000).text).toContain('[A](/cms/a)');
		expect(site.calls).toEqual([]);
	});

	it('survives a throwing source', async () => {
		const { map, crawl } = setup({}, { pages: { source: async () => Promise.reject(new Error('cms down')) } });
		await crawl();
		expect(map.complete()).toBe(true);
		expect(map.pages()).toEqual([]);
	});
});

describe('site map: lifecycle', () => {
	it('marks the outline partial while the crawl runs, and waitFor gives up after ms', async () => {
		const { map, handed, waitUntil } = setup(chain(4), {}, { latency: 30 });
		expect(map.complete()).toBe(false);
		map.ensureStarted(waitUntil);
		const started = Date.now();
		await map.waitFor(20);
		expect(Date.now() - started).toBeLessThan(200);
		expect(map.complete()).toBe(false);
		expect(map.outline(6000).partial).toBe(true);
		await Promise.all(handed);
		expect(map.complete()).toBe(true);
		expect(map.outline(6000).partial).toBe(false);
		await map.waitFor(10_000); // resolves at once when complete
	});

	it('is idempotent and re-crawls when the TTL lapses', async () => {
		let title = 'Home v1';
		const { site, map, handed, waitUntil, advance } = setup({
			'/': { body: () => htmlPage({ title, description: 'Root description' }) }
		});
		map.ensureStarted(waitUntil);
		map.ensureStarted(waitUntil);
		expect(handed).toHaveLength(1);
		await Promise.all(handed);
		expect(map.site()).toEqual({ title: 'Home v1', summary: 'Root description' });
		map.ensureStarted(waitUntil);
		expect(handed).toHaveLength(1);

		title = 'Home v2';
		advance(3_601_000);
		map.ensureStarted(waitUntil);
		expect(handed.length).toBeGreaterThan(1);
		expect(map.complete()).toBe(true); // the previous map stays served while revisiting
		// The crawl hands stale pages' refreshes to waitUntil too; drain them all.
		for (let i = 0; i < handed.length; i++) await handed[i];
		map.ensureStarted(waitUntil);
		for (let i = 0; i < handed.length; i++) await handed[i];
		expect(map.site().title).toBe('Home v2');
		expect(site.htmlReads().filter((p) => p === '/').length).toBe(2);
	});

	it('prefers facts over the root description for the summary', async () => {
		const { map, crawl } = setup(
			{ '/': { body: htmlPage({ title: 'Home', description: 'Root description' }) } },
			{ facts: ['We sell tea.'] }
		);
		await crawl();
		expect(map.site()).toEqual({ title: 'Home', summary: 'We sell tea.' });
	});
});
