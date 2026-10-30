import { describe, it, expect } from 'vitest';
import {
	parseLlmsTxt,
	splitLlmsFull,
	renderLlmsTxt,
	renderLlmsFull,
	renderPageMarkdown,
	markdownPathFor,
	routeForMarkdownPath,
	outlineFrom,
	type MapPage
} from '../../../src/site/llms';

// The example from https://llmstxt.org
const EXAMPLE = `# FastHTML

> FastHTML is a python library which brings together Starlette, Uvicorn, HTMX, and fastcore's \`FT\` "FastTags" into a library for creating server-rendered hypermedia applications.

Important notes:

- Although parts of its API are inspired by FastAPI, it is *not* compatible with FastAPI syntax and is not targeted at creating API services
- FastHTML is compatible with JS-native web components and any vanilla JS library, but not with React, Vue, or Svelte

## Docs

- [FastHTML quick start](https://fastht.ml/docs/tutorials/quickstart_for_web_devs.html.md): A brief overview of many FastHTML features
- [HTMX reference](https://raw.githubusercontent.com/path/reference.md): Brief description of all HTMX attributes, CSS classes, headers, events, extensions, js lib methods, and config options

## Examples

- [Todo list application](https://raw.githubusercontent.com/path/adv_app.py): Detailed walk-thru of a complete CRUD app in FastHTML showing idiomatic use of FastHTML and HTMX patterns.

## Optional

- [Starlette full documentation](https://gist.githubusercontent.com/path/starlette-sml.md): A subset of the Starlette documentation useful for FastHTML development.
`;

function page(route: string, title: string, extra: Partial<MapPage> = {}): MapPage {
	return { route, title, headings: [], text: `Text of ${title}.`, fromSource: false, ...extra };
}

const site = { title: 'Acme', summary: 'Acme makes anvils.' };
const pages: MapPage[] = [
	page('/', 'Home', { description: 'Welcome' }),
	page('/docs/intro', 'Intro', { description: 'Start here' }),
	page('/docs/advanced', 'Advanced [beta]'),
	page('/getting-started', 'Getting started', { description: 'Install: then run' }),
	page('/private/secret', 'Secret'),
	page('/cms/draft', 'Draft', { fromSource: true }),
	page('/api/data', 'API data'),
	page('/logout', 'Logout')
];

describe('parseLlmsTxt', () => {
	const doc = parseLlmsTxt(EXAMPLE);

	it('reads title, summary and details', () => {
		expect(doc.title).toBe('FastHTML');
		expect(doc.summary).toMatch(/^FastHTML is a python library .* hypermedia applications\.$/);
		expect(doc.details).toContain('Important notes:');
		expect(doc.details).toContain('not with React, Vue, or Svelte');
	});

	it('reads links with sections, descriptions and the Optional flag', () => {
		expect(doc.links).toHaveLength(4);
		expect(doc.links[0]).toEqual({
			title: 'FastHTML quick start',
			url: 'https://fastht.ml/docs/tutorials/quickstart_for_web_devs.html.md',
			description: 'A brief overview of many FastHTML features',
			optional: false,
			section: 'Docs'
		});
		expect(doc.links.map((l) => l.section)).toEqual(['Docs', 'Docs', 'Examples', 'Optional']);
		expect(doc.links.map((l) => l.optional)).toEqual([false, false, false, true]);
	});

	it('does not treat the list in the details as links', () => {
		expect(doc.links.some((l) => l.title.includes('Although'))).toBe(false);
	});

	it('accepts links without description and tolerates CRLF', () => {
		const d = parseLlmsTxt('# T\r\n\r\n## S\r\n\r\n- [A](/a)\r\n* [B](/b): x\r\n');
		expect(d.links).toEqual([
			{ title: 'A', url: '/a', optional: false, section: 'S' },
			{ title: 'B', url: '/b', description: 'x', optional: false, section: 'S' }
		]);
		expect(d.summary).toBeUndefined();
		expect(d.details).toBeUndefined();
	});

	it('never throws on junk', () => {
		expect(parseLlmsTxt('')).toEqual({ title: '', links: [] });
		expect(parseLlmsTxt('<html>nope</html>').links).toEqual([]);
	});

	it('removes a closing run from a section but not from the title', () => {
		const d = parseLlmsTxt('# Title ##\n\n## Docs ##  \n\n- [A](/a)\n\n## C#\n\n- [B](/b)\n\n## \n\n- [C](/c)');
		expect(d.title).toBe('Title ##');
		expect(d.links.map((l) => l.section)).toEqual(['Docs', 'C', '']);
	});

	it('ends a url at the first ) followed by the end of the line or a description', () => {
		const url = (line: string) => parseLlmsTxt(`## S\n${line}`).links[0];
		expect(url('- [A](/a_(b)) ')).toMatchObject({ url: '/a_(b)' });
		expect(url('- [A](/a) b): c')).toMatchObject({ url: '/a) b', description: 'c' });
		expect(url('- [A](/a) : c : d )  ')).toMatchObject({ url: '/a', description: 'c : d )' });
		expect(url('- [A]()')).toBeUndefined();
		expect(url('- [A]())')).toMatchObject({ url: ')' });
		expect(url('- [A](/a) b')).toBeUndefined();
		expect(url('- [A\\]B](/a)')).toMatchObject({ title: 'A]B' });
		expect(url('- [A](/a)\u2028')).toMatchObject({ url: '/a' });
		expect(url('- [A](/a):\u2028 b')).toMatchObject({ description: 'b' });
		expect(url('- [A](/a): b\u2028c')).toBeUndefined();
	});

	it('parses pathological lines correctly and fast', () => {
		const spaces = ' '.repeat(50_000);
		const start = performance.now();
		expect(parseLlmsTxt(`# a${spaces}x`).title).toBe(`a${spaces}x`);
		const d = parseLlmsTxt(
			[
				`# T${spaces}`,
				`## a${spaces}x`,
				`- [A](/a): b${spaces}c`,
				`- [B](/b)${spaces}x`,
				`- [C](/c):${spaces}\u2028d\u2028e`,
				`- [D](${'): '.repeat(50_000)}\u2028f\u2028g`,
				`- [${'['.repeat(50_000)}`,
				`## b${spaces}##`,
				`- [E](/e)${spaces}`
			].join('\n')
		);
		expect(d.title).toBe('T');
		expect(d.links).toEqual([
			{ title: 'A', url: '/a', description: `b${spaces}c`, optional: false, section: `a${spaces}x` },
			{ title: 'E', url: '/e', optional: false, section: 'b' }
		]);
		expect(performance.now() - start).toBeLessThan(1000);
	});
});

describe('renderLlmsTxt', () => {
	const opts = { exclude: ['/private/**'], serveSource: false };
	const text = renderLlmsTxt(site, pages, opts);
	const doc = parseLlmsTxt(text);

	it('starts with H1 and summary blockquote', () => {
		expect(text.startsWith('# Acme\n\n> Acme makes anvils.\n\n')).toBe(true);
	});

	it('round-trips every served page', () => {
		const served = ['/', '/docs/intro', '/docs/advanced', '/getting-started'];
		expect(doc.title).toBe('Acme');
		expect(doc.summary).toBe('Acme makes anvils.');
		expect(doc.links.map((l) => l.url)).toEqual(served);
		const byUrl = new Map(doc.links.map((l) => [l.url, l]));
		for (const route of served) {
			const p = pages.find((x) => x.route === route)!;
			expect(byUrl.get(route)?.title).toBe(p.title);
			expect(byUrl.get(route)?.description).toBe(p.description);
		}
	});

	it('groups by top-level segment, root under Pages, title-cased', () => {
		expect(doc.links.map((l) => l.section)).toEqual(['Pages', 'Docs', 'Docs', 'Getting Started']);
		expect(text).toContain('## Docs\n\n- [Intro](/docs/intro): Start here\n- [Advanced \\[beta\\]](/docs/advanced)\n');
	});

	it('leaves out user and default excludes', () => {
		for (const r of ['/private/secret', '/api/data', '/logout']) expect(text).not.toContain(`](${r})`);
	});

	it('leaves out pages.source pages unless serveSource', () => {
		expect(text).not.toContain('/cms/draft');
		const withSource = parseLlmsTxt(renderLlmsTxt(site, pages, { ...opts, serveSource: true }));
		expect(withSource.links.map((l) => l.url)).toContain('/cms/draft');
	});

	it('keeps one line per link even with newlines in titles/descriptions', () => {
		const t = renderLlmsTxt(site, [page('/x', 'A\nB', { description: 'c\n\nd' })], { exclude: [], serveSource: false });
		expect(parseLlmsTxt(t).links[0]).toMatchObject({ title: 'A B', url: '/x', description: 'c d' });
	});
});

describe('renderLlmsFull and splitLlmsFull', () => {
	const opts = { exclude: ['/private/**'], serveSource: false };
	const full = renderLlmsFull(site, pages, opts);

	it('contains every served page and no excluded or source page', () => {
		expect(full.startsWith('# Acme\n\n> Acme makes anvils.\n')).toBe(true);
		expect(full).toContain('Text of Intro.');
		expect(full).not.toContain('Text of Secret.');
		expect(full).not.toContain('Text of Draft.');
		expect(full).not.toContain('Text of API data.');
		expect(renderLlmsFull(site, pages, { ...opts, serveSource: true })).toContain('Text of Draft.');
	});

	it('splits its own output back into pages with routes', () => {
		const parts = splitLlmsFull(full).filter((p) => p.route);
		expect(parts.map((p) => p.route)).toEqual(['/', '/docs/intro', '/docs/advanced', '/getting-started']);
		expect(parts[1]).toMatchObject({ title: 'Intro' });
		expect(parts[1]!.text).toContain('Text of Intro.');
		expect(parts[1]!.text).not.toContain('Source:');
	});

	it('splits a foreign llms-full with URL lines, title matching and code fences', () => {
		const fixture = [
			'# Quick start',
			'URL: https://site.dev/docs/quick-start',
			'',
			'Install it.',
			'```sh',
			'# not a heading',
			'```',
			'',
			'# Getting Started',
			'',
			'Body two.',
			'',
			'# Unknown page',
			'Body three.'
		].join('\n');
		const parts = splitLlmsFull(fixture, ['/', '/guide/getting-started']);
		expect(parts).toHaveLength(3);
		expect(parts[0]).toEqual({
			route: 'https://site.dev/docs/quick-start',
			title: 'Quick start',
			text: 'Install it.\n```sh\n# not a heading\n```'
		});
		expect(parts[1]).toEqual({ route: '/guide/getting-started', title: 'Getting Started', text: 'Body two.' });
		expect(parts[2]).toEqual({ title: 'Unknown page', text: 'Body three.' });
	});

	it('parses pathological lines correctly and fast', () => {
		const spaces = ' '.repeat(50_000);
		const start = performance.now();
		const parts = splitLlmsFull(`# a${spaces}x\nSource:${spaces}/a${spaces}\nBody.\n# b ##${spaces}\nsource: /b${spaces}c`);
		expect(parts).toEqual([
			{ route: '/a', title: `a${spaces}x`, text: 'Body.' },
			{ title: 'b ##', text: `source: /b${spaces}c` }
		]);
		expect(performance.now() - start).toBeLessThan(1000);
	});
});

describe('renderPageMarkdown', () => {
	it('renders title, description and text', () => {
		expect(renderPageMarkdown(page('/a', 'A', { description: 'D', text: 'Body' }))).toBe('# A\n\n> D\n\nBody\n');
		expect(renderPageMarkdown(page('/a', 'A', { text: 'Body' }))).toBe('# A\n\nBody\n');
	});
});

describe('markdown paths', () => {
	const table: [string, string][] = [
		['/', '/index.html.md'],
		['/a/', '/a/index.html.md'],
		['/a', '/a.md'],
		['/docs/intro', '/docs/intro.md'],
		['/docs/b/', '/docs/b/index.html.md']
	];
	it.each(table)('%s <-> %s', (route, md) => {
		expect(markdownPathFor(route)).toBe(md);
		expect(routeForMarkdownPath(md)).toBe(route);
	});
	it('returns null for non-.md paths', () => {
		for (const p of ['/a', '/a.mdx', '/.md', '/a/.md', 'a.md', '', '/llms.txt']) expect(routeForMarkdownPath(p)).toBeNull();
	});
});

describe('outlineFrom', () => {
	const mapped: MapPage[] = [
		page('/', 'Home', { description: 'Welcome' }),
		page('/docs/a', 'A', {
			description: 'Doc A',
			headings: [
				{ level: 1, text: 'A' },
				{ level: 2, text: 'Setup' },
				{ level: 3, text: 'Details' }
			]
		}),
		page('/docs/b', 'B', { headings: [{ level: 2, text: 'Usage' }] })
	];

	it('matches the llms.txt rendering without headings', () => {
		const out = outlineFrom(site, mapped, { maxChars: 10_000, withHeadings: false });
		expect(out.cut).toBe(false);
		expect(out.text).toBe(renderLlmsTxt(site, mapped, { exclude: [], serveSource: true }));
	});

	it('indents headings under links when room allows', () => {
		const out = outlineFrom(site, mapped, { maxChars: 10_000, withHeadings: true });
		expect(out.cut).toBe(false);
		expect(out.text).toContain('- [A](/docs/a): Doc A\n  - Setup\n    - Details\n- [B](/docs/b)\n  - Usage\n');
		expect(out.text).not.toContain('  - A\n');
		expect(parseLlmsTxt(out.text).links).toHaveLength(3);
	});

	it('drops headings (not links) when they do not fit', () => {
		const plain = outlineFrom(site, mapped, { maxChars: 10_000, withHeadings: false }).text;
		const out = outlineFrom(site, mapped, { maxChars: plain.length + 5, withHeadings: true });
		expect(out.cut).toBe(false);
		expect(out.text).toBe(plain);
	});

	it('uses a site-provided llms.txt verbatim as the base', () => {
		const base = parseLlmsTxt(EXAMPLE);
		const out = outlineFrom(site, [], { maxChars: 10_000, withHeadings: true }, base);
		expect(out.cut).toBe(false);
		expect(out.text).toContain('# FastHTML');
		expect(out.text).toContain('Important notes:');
		expect(parseLlmsTxt(out.text)).toEqual(base);
	});

	it('appends mapped pages missing from the base after its links, Optional still last', () => {
		const base = parseLlmsTxt(EXAMPLE);
		const first = base.links[0]!.url;
		const withDup = [...mapped, page(first, 'Dup')];
		const out = outlineFrom(site, withDup, { maxChars: 10_000, withHeadings: true }, base);
		expect(out.cut).toBe(false);
		const urls = parseLlmsTxt(out.text).links.map((l) => l.url);
		expect(urls.filter((u) => u === first)).toHaveLength(1);
		expect(urls).toEqual(expect.arrayContaining(['/', '/docs/a', '/docs/b']));
		// base links keep their author order and come before any appended page
		const baseUrls = base.links.filter((l) => !l.optional).map((l) => l.url);
		expect(urls.filter((u) => baseUrls.includes(u))).toEqual(baseUrls);
		expect(out.text.indexOf(first)).toBeLessThan(out.text.indexOf('(/docs/a)'));
		expect(out.text.trimEnd().split('\n').at(-1)).toContain('Starlette full documentation');
		expect(out.text).not.toContain('Dup');
		expect(out.text).toContain('- [A](/docs/a): Doc A\n  - Setup\n');
	});

	it('cuts Optional first, then at the last whole link line', () => {
		const base = parseLlmsTxt(EXAMPLE);
		const whole = outlineFrom(site, mapped, { maxChars: 10_000, withHeadings: false }, base).text;
		const optionalLine = whole.split('\n').find((l) => l.includes('Starlette full documentation'))!;

		const a = outlineFrom(site, mapped, { maxChars: whole.length - 1, withHeadings: false }, base);
		expect(a.cut).toBe(true);
		expect(a.text.length).toBeLessThanOrEqual(whole.length - 1);
		expect(a.text).not.toContain(optionalLine);
		expect(a.text).not.toContain('## Optional');
		expect(a.text).toContain('Todo list application');
		expect(a.text.endsWith('\n(outline cut)')).toBe(true);

		const b = outlineFrom(site, mapped, { maxChars: whole.length - 300, withHeadings: false }, base);
		expect(b.cut).toBe(true);
		expect(b.text.length).toBeLessThanOrEqual(whole.length - 300);
		expect(b.text).not.toContain('Starlette full documentation');
		expect(b.text).not.toContain('Todo list application');
		expect(b.text).not.toContain('## Examples');
		// every remaining link line is whole
		const linkLines = b.text.split('\n').filter((l) => l.startsWith('- ['));
		for (const l of linkLines) expect(whole.split('\n')).toContain(l);
		expect(parseLlmsTxt(b.text).links.length).toBeGreaterThan(0);
	});

	it('cuts a generated outline at a whole link line within maxChars', () => {
		const many = Array.from({ length: 50 }, (_, i) => page(`/p/${i}`, `Page ${i}`, { description: 'x'.repeat(40) }));
		const out = outlineFrom(site, many, { maxChars: 1000, withHeadings: true });
		expect(out.cut).toBe(true);
		expect(out.text.length).toBeLessThanOrEqual(1000);
		const links = parseLlmsTxt(out.text).links;
		expect(links.length).toBeGreaterThan(5);
		expect(links.length).toBeLessThan(50);
		expect(links.every((l) => l.description === 'x'.repeat(40))).toBe(true);
	});
});
