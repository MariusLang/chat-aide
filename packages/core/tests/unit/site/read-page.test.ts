import { describe, it, expect } from 'vitest';
import { createReader, markdownHrefs, pageFromMarkdown } from '../../../src/site/read-page';
import { createTransport } from '../../../src/site/transport';
import { createPageCache } from '../../../src/site/cache';
import { acceptHref } from '../../../src/site/route';
import { LIMIT_DEFAULTS, type Limits } from '../../../src/shared/limits';
import { createFakeSite, htmlPage, type FakePage } from '../../fixtures/site';

function setup(
	pages: Record<string, FakePage>,
	o: { preferMarkdown?: boolean; respectNoindex?: boolean; limits?: Partial<Limits>; latency?: number } = {}
) {
	let t = 1_000_000;
	const now = () => t;
	const limits = { ...LIMIT_DEFAULTS, ...o.limits };
	const site = createFakeSite(pages, { latency: o.latency });
	const transport = createTransport({ exclude: [] });
	transport.setInProcessFetch(site.fetch);
	const cache = createPageCache({ maxPages: limits.maxPages, ttlSeconds: 3600, now });
	const reader = createReader({
		transport,
		cache,
		limits,
		preferMarkdown: o.preferMarkdown ?? false,
		respectNoindex: o.respectNoindex,
		now
	});
	return { site, cache, reader, transport, limits, now, advance: (ms: number) => (t += ms) };
}

const NOINDEX_META = '<meta name="robots" content="noindex">';

/** `htmlPage` with extra tags in its head. */
function withHead(tags: string, p: Parameters<typeof htmlPage>[0]): string {
	return htmlPage(p).replace('</head>', `${tags}</head>`);
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
	it('uses <route>.md when present, and asks for the HTML only to see what it says to robots', async () => {
		const { site, reader } = setup(
			{
				'/guide': { body: htmlPage({ title: 'Guide HTML', links: ['/from-html'] }) },
				'/guide.md': md('# Guide\n\n> The guide.\n\n## Install\n\nRun it.\n\n### Deep\n\n[next](/from-md)')
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
		expect(entry!.text).not.toContain('Guide HTML');
		expect(reader.links('/guide')).toEqual(['/from-md']);
		expect(site.paths()).toEqual(['/guide.md', '/guide']);
		expect(site.calls[0]!.accept).toContain('text/markdown');
	});

	it('never requests the HTML of a page with a twin when respectNoindex is off', async () => {
		const { site, reader } = setup(
			{ '/guide': { body: withHead(NOINDEX_META, { title: 'Guide HTML' }) }, '/guide.md': md('# Guide\n\nRun it.') },
			{ preferMarkdown: true, respectNoindex: false }
		);
		expect(await reader.readPage('/guide')).toMatchObject({ title: 'Guide', source: 'markdown' });
		expect(site.paths()).toEqual(['/guide.md']);
		expect(site.htmlReads()).toEqual([]);
	});

	it('reads the root twin at /index.html.md, also when the page itself is not HTML', async () => {
		const { site, reader } = setup({ '/index.html.md': md('# Home\n\ntext') }, { preferMarkdown: true });
		expect((await reader.readPage('/'))!.source).toBe('markdown');
		expect(site.paths()).toEqual(['/index.html.md', '/']);
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

describe('readPage: noindex', () => {
	const SECRET = 'SECRET-TEXT of a page that is not to be indexed. '.repeat(8);
	const secret = (tags = NOINDEX_META) => withHead(tags, { title: 'Secret', body: SECRET, links: ['/next'] });

	it('gives no entry for a page with a noindex meta tag, and caches the mark without any text', async () => {
		const { site, reader, cache } = setup({ '/secret': { body: secret() } });
		expect(await reader.read('/secret')).toEqual({ entry: null, noindex: true });
		expect(await reader.readPage('/secret')).toBeNull();
		expect(site.paths()).toEqual(['/secret']);
		expect(cache.peek('/secret')).toMatchObject({ kind: 'miss', noindex: true });
		expect(JSON.stringify(cache.peek('/secret'))).not.toContain('SECRET-TEXT');
	});

	it('gives no entry for a page sent with X-Robots-Tag: noindex', async () => {
		const { reader, cache } = setup({
			'/secret': { body: htmlPage({ title: 'Secret', body: SECRET }), headers: { 'X-Robots-Tag': 'noindex' } }
		});
		expect(await reader.read('/secret')).toEqual({ entry: null, noindex: true });
		expect(cache.peek('/secret')).toMatchObject({ kind: 'miss', noindex: true });
	});

	it('tells a noindex page from an unreadable one', async () => {
		const { reader } = setup({ '/gone': { status: 404 } });
		expect(await reader.read('/gone')).toEqual({ entry: null, noindex: false });
	});

	it('skips a directive for one crawler, in the tag and in the header', async () => {
		const { reader } = setup({
			'/a': { body: withHead('<meta name="googlebot" content="noindex">', { title: 'A' }) },
			'/b': { body: htmlPage({ title: 'B' }), headers: { 'X-Robots-Tag': 'googlebot: noindex' } }
		});
		expect((await reader.read('/a')).entry).toMatchObject({ title: 'A' });
		expect((await reader.read('/b')).entry).toMatchObject({ title: 'B' });
	});

	it('keeps the links of a noindex page for the crawl, and drops them on nofollow or none', async () => {
		const { reader } = setup({
			'/noindex': { body: secret() },
			'/both': { body: secret('<meta name="robots" content="noindex, nofollow">') },
			'/none': { body: secret('<meta name="robots" content="none">') },
			'/nofollow': { body: secret('<meta name="robots" content="nofollow">') },
			'/header': { body: secret(''), headers: { 'X-Robots-Tag': 'nofollow' } }
		});
		expect((await reader.read('/noindex')).noindex).toBe(true);
		expect(reader.links('/noindex')).toEqual(['/next']);
		expect((await reader.read('/both')).noindex).toBe(true);
		expect(reader.links('/both')).toEqual([]);
		expect((await reader.read('/none')).noindex).toBe(true);
		expect(reader.links('/none')).toEqual([]);
		// nofollow alone: the page is read, its links are not followed.
		expect((await reader.read('/nofollow')).entry).toMatchObject({ title: 'Secret' });
		expect(reader.links('/nofollow')).toEqual([]);
		expect((await reader.read('/header')).entry).toMatchObject({ title: 'Secret' });
		expect(reader.links('/header')).toEqual([]);
	});

	it('reads the page again only once the mark is a TTL old', async () => {
		const { site, reader, advance } = setup({ '/secret': { body: secret() } });
		await reader.read('/secret');
		advance(3_600_000 - 1);
		expect(await reader.read('/secret')).toEqual({ entry: null, noindex: true });
		expect(site.paths()).toEqual(['/secret']);
		site.set('/secret', { body: htmlPage({ title: 'Public now', body: 'x'.repeat(300) }) });
		advance(1);
		expect((await reader.read('/secret')).entry).toMatchObject({ title: 'Public now' });
		expect(site.paths()).toEqual(['/secret', '/secret']);
	});

	it('a cached page that turns noindex is dropped by its refresh', async () => {
		const { site, reader, cache, advance } = setup({
			'/a': { body: htmlPage({ title: 'A', body: SECRET }) }
		});
		expect((await reader.read('/a')).entry).toMatchObject({ title: 'A' });
		site.set('/a', { body: secret() });
		advance(3_600_001);
		const refreshes: Promise<unknown>[] = [];
		// Stale-while-revalidate: this read still answers from the cache.
		expect((await reader.read('/a', { waitUntil: (p) => void refreshes.push(p) })).entry).not.toBeNull();
		await Promise.all(refreshes);
		expect(cache.peek('/a')).toMatchObject({ kind: 'miss', noindex: true });
		expect(JSON.stringify(cache.peek('/a'))).not.toContain('SECRET-TEXT');
		expect(await reader.read('/a')).toEqual({ entry: null, noindex: true });
	});

	it('respectNoindex: false reads the page as before, links included', async () => {
		const { reader, cache } = setup(
			{ '/secret': { body: secret('<meta name="robots" content="none">'), headers: { 'X-Robots-Tag': 'noindex' } } },
			{ respectNoindex: false }
		);
		const read = await reader.read('/secret');
		expect(read.noindex).toBe(false);
		expect(read.entry!.text).toContain('SECRET-TEXT');
		expect(reader.links('/secret')).toEqual(['/next']);
		expect(cache.peek('/secret')).toMatchObject({ kind: 'page' });
	});

	it('respectNoindex: false does not take a mark another reader left for an answer', async () => {
		const { site, reader, cache, transport, limits, now } = setup({ '/secret': { body: secret() } });
		await reader.read('/secret');
		const other = createReader({ transport, cache, limits, preferMarkdown: false, respectNoindex: false, now });
		expect((await other.read('/secret')).entry).toMatchObject({ title: 'Secret' });
		expect(site.paths()).toEqual(['/secret', '/secret']);
	});

	describe('with a .md twin', () => {
		const twin = md('# Secret\n\nSECRET-TEXT in markdown. [next](/next)');

		it('drops the page when its HTML says noindex', async () => {
			const { reader, cache } = setup({ '/secret': { body: secret() }, '/secret.md': twin }, { preferMarkdown: true });
			expect(await reader.read('/secret')).toEqual({ entry: null, noindex: true });
			expect(reader.links('/secret')).toEqual(['/next']);
			expect(JSON.stringify(cache.peek('/secret'))).not.toContain('SECRET-TEXT');
		});

		it('drops the page when its HTML is sent with X-Robots-Tag: noindex', async () => {
			const { reader } = setup(
				{ '/secret': { body: secret(''), headers: { 'x-robots-tag': 'noindex, nofollow' } }, '/secret.md': twin },
				{ preferMarkdown: true }
			);
			expect(await reader.read('/secret')).toEqual({ entry: null, noindex: true });
			expect(reader.links('/secret')).toEqual([]);
		});

		it('takes X-Robots-Tag on the twin as being about the .md file, not the page', async () => {
			const { reader } = setup(
				{
					'/guide': { body: htmlPage({ title: 'Guide HTML' }) },
					'/guide.md': { ...md('# Guide\n\nRun it.'), headers: { 'X-Robots-Tag': 'noindex' } }
				},
				{ preferMarkdown: true }
			);
			expect((await reader.read('/guide')).entry).toMatchObject({ title: 'Guide', source: 'markdown' });
		});

		it('keeps the twin of a page that is not HTML, but not of one that could not be reached', async () => {
			const moved = { status: 302, headers: { location: 'https://elsewhere.example/' } };
			const { reader } = setup({ '/secret': moved, '/secret.md': twin }, { preferMarkdown: true });
			expect((await reader.read('/secret')).entry).toMatchObject({ source: 'markdown' });

			const down = setup({ '/secret.md': twin }, { preferMarkdown: true });
			const fetch = down.site.fetch;
			down.transport.setInProcessFetch((input, init) =>
				String(input).endsWith('.md') ? fetch(input, init) : Promise.reject(new Error('down'))
			);
			expect(await down.reader.read('/secret')).toEqual({ entry: null, noindex: false });
			expect(down.cache.peek('/secret')).toMatchObject({ kind: 'miss' });
			expect(JSON.stringify(down.cache.peek('/secret'))).not.toContain('SECRET-TEXT');
		});
	});
});

describe('pageFromMarkdown: headings', () => {
	const heading = (line: string) => pageFromMarkdown(line).headings;

	it.each([
		['# Title', 1, 'Title'],
		['##   Spaced   out  ', 2, 'Spaced out'],
		['### Closed ###', 3, 'Closed'],
		['## Closed ##   ', 2, 'Closed'],
		['# C#', 1, 'C'],
		['# a # #', 1, 'a #'],
		['# a ## b', 1, 'a ## b'],
		['# #tag', 1, '#tag'],
		['#\tTab', 1, 'Tab']
	])('reads %j', (line, level, text) => {
		expect(heading(line)).toEqual([{ level, text }]);
	});

	it.each(['#', '#nope', ' # indented', '#### deep', '# ', '# ##', '# a\u2028b'])('finds none in %j', (line) => {
		expect(heading(line)).toEqual([]);
	});

	it('parses pathological lines correctly and fast', () => {
		const spaces = ' '.repeat(50_000);
		const start = performance.now();
		expect(heading(`# a${spaces}x`)).toEqual([{ level: 1, text: 'a x' }]);
		expect(heading(`## a${spaces}##`)).toEqual([{ level: 2, text: 'a' }]);
		expect(heading(`### a${spaces}#${spaces}x`)).toEqual([{ level: 3, text: 'a # x' }]);
		expect(heading(`#${spaces}`)).toEqual([]);
		expect(heading(`# ${'#'.repeat(50_000)}x`)).toEqual([{ level: 1, text: `${'#'.repeat(50_000)}x` }]);
		expect(heading(`# a${spaces}\u2028x`)).toEqual([]);
		expect(performance.now() - start).toBeLessThan(1000);
	});
});

describe('markdownHrefs', () => {
	it.each([
		['[a](/x)', ['/x']],
		['[a]( <b> "T" ) [c](d "e")', ['b', 'd']],
		['[a\\]b](/x) [c[d](/y)', ['/x', '/y']],
		['[a](<) [b](<>) [c](>)', ['<', '<']],
		['[a](x y) [b](/z) [c](', ['/z']],
		['[a](xx[yy zz](c)', ['c']],
		['[a\\\nb](/x) [c](/y)', ['/y']],
		['[a](/x "t) [b](/y "u") [c](/z)', ['/y', '/z']]
	])('reads %j', (markdown, hrefs) => {
		expect(markdownHrefs(markdown)).toEqual(hrefs);
	});

	it('parses pathological bodies correctly and fast', () => {
		const n = 200_000;
		const start = performance.now();
		expect(markdownHrefs('['.repeat(n))).toEqual([]);
		expect(markdownHrefs(`${'['.repeat(n)}]x [a](/y)`)).toEqual(['/y']);
		expect(markdownHrefs('[a]('.repeat(n))).toEqual([]);
		expect(markdownHrefs(`${'[a]('.repeat(n)}${' '.repeat(n)}x [b](/y)`)).toEqual(['/y']);
		expect(markdownHrefs(`[a](/x${' '.repeat(n)}) [b](/y${' '.repeat(n)}x`)).toEqual(['/x']);
		expect(markdownHrefs('[a](/x "'.repeat(n))).toEqual([]);
		expect(performance.now() - start).toBeLessThan(1000);
	});

	it('keeps a page with a pathological line readable through the reader', async () => {
		const spaces = ' '.repeat(50_000);
		const { reader } = setup(
			{ '/a.md': md(`# A${spaces}##\n\n${'['.repeat(50_000)}\n\n## B${spaces}x\n\n[C](/c.md)`) },
			{ preferMarkdown: true }
		);
		const start = performance.now();
		const entry = await reader.readPage('/a');
		expect(performance.now() - start).toBeLessThan(1000);
		expect(entry!.headings).toEqual([
			{ level: 1, text: 'A' },
			{ level: 2, text: 'B x' }
		]);
		expect(reader.links('/a')).toEqual(['/c']);
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
