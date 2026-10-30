import { describe, it, expect } from 'vitest';
import {
	parseAnswer,
	type MdBlock,
	type MdInline,
	type MdOptions
} from '../../../src/shared/markdown';

const SAME: MdOptions = { origin: 'https://site.dev', answerLinks: 'same-origin' };
const ANY: MdOptions = { origin: 'https://site.dev', answerLinks: 'any' };

function inlines(blocks: MdBlock[]): MdInline[] {
	const out: MdInline[] = [];
	const walkInline = (xs: MdInline[]) => {
		for (const x of xs) {
			out.push(x);
			if ('c' in x) walkInline(x.c);
		}
	};
	const walk = (bs: MdBlock[]) => {
		for (const b of bs) {
			if (b.t === 'p' || b.t === 'h') walkInline(b.c);
			else if (b.t === 'quote') walk(b.c);
			else if (b.t === 'list') b.items.forEach(walk);
		}
	};
	walk(blocks);
	return out;
}

function links(blocks: MdBlock[]) {
	return inlines(blocks).filter((x): x is Extract<MdInline, { t: 'link' }> => x.t === 'link');
}

function plain(blocks: MdBlock[]): string {
	return inlines(blocks)
		.map((x) => (x.t === 'text' || x.t === 'code' ? x.v : ''))
		.join('');
}

describe('parseAnswer — hostile corpus', () => {
	it('renders raw HTML img with onerror as text', () => {
		const out = parseAnswer('<img src=x onerror=alert(1)>', SAME);
		expect(plain(out)).toContain('<img src=x onerror=alert(1)>');
		expect(links(out)).toHaveLength(0);
	});

	it('renders inline raw HTML img as text', () => {
		const out = parseAnswer('hi <img src=x onerror=alert(1)> there', SAME);
		expect(plain(out)).toBe('hi <img src=x onerror=alert(1)> there');
	});

	it('renders <script> as text', () => {
		const out = parseAnswer('<script>alert(1)</script>', SAME);
		expect(plain(out)).toContain('<script>alert(1)</script>');
	});

	it.each([
		'[x](javascript:alert(1))',
		'[x](JaVaScRiPt:alert(1))',
		'[x](data:text/html,<script>alert(1)</script>)',
		'[x](vbscript:msgbox(1))',
		'[x]( javascript:alert(1))',
		'[x](java\tscript:alert(1))',
		'<javascript:alert(1)>',
		'[x][r]\n\n[r]: javascript:alert(1)',
		'[x](mailto:a@b.dev)',
		'<a href="javascript:alert(1)">x</a>'
	])('drops the dangerous link in %j', (md) => {
		for (const opts of [SAME, ANY]) {
			const out = parseAnswer(md, opts);
			expect(links(out)).toHaveLength(0);
			expect(JSON.stringify(out)).not.toContain('"href"');
		}
	});

	it('keeps the text of a dropped link', () => {
		const out = parseAnswer('[click me](javascript:alert(1))', ANY);
		expect(out).toEqual([{ t: 'p', c: [{ t: 'text', v: 'click me' }] }]);
	});

	it('inline image becomes its alt text', () => {
		const out = parseAnswer('![a](https://evil/x.png)', SAME);
		expect(out).toEqual([{ t: 'p', c: [{ t: 'text', v: 'a' }] }]);
		expect(JSON.stringify(out)).not.toContain('evil/x.png');
	});

	it('image with empty alt becomes nothing', () => {
		const out = parseAnswer('![](https://evil/x.png)', ANY);
		expect(JSON.stringify(out)).not.toContain('evil');
		expect(plain(out)).toBe('');
	});

	it('reference image becomes its alt text', () => {
		const out = parseAnswer('![a][r]\n\n[r]: https://evil/p.png', ANY);
		expect(JSON.stringify(out)).not.toContain('evil/p.png');
		expect(plain(out)).toBe('a');
	});

	it('image inside a link does not leak its URL', () => {
		const out = parseAnswer('[![a](https://evil/x.png)](/docs)', SAME);
		expect(JSON.stringify(out)).not.toContain('evil');
		expect(links(out)).toEqual([
			{ t: 'link', href: '/docs', external: false, c: [{ t: 'text', v: 'a' }] }
		]);
	});

	it('same-origin relative link is an internal link', () => {
		const out = parseAnswer('[Privacy](/privacy)', SAME);
		expect(out).toEqual([
			{
				t: 'p',
				c: [{ t: 'link', href: '/privacy', external: false, c: [{ t: 'text', v: 'Privacy' }] }]
			}
		]);
	});

	it('same-origin absolute link keeps path, search and hash', () => {
		const out = parseAnswer('[x](https://site.dev/a/../b?q=1#h)', SAME);
		expect(links(out)[0]).toMatchObject({ href: '/b?q=1#h', external: false });
	});

	it('protocol-relative link to another host is not internal', () => {
		expect(links(parseAnswer('[x](//evil.dev/p)', SAME))).toHaveLength(0);
		expect(links(parseAnswer('[x](//evil.dev/p)', ANY))[0]).toMatchObject({
			href: 'https://evil.dev/p',
			external: true
		});
	});

	it.each([
		'[x](/.//evil.com/x)',
		'[x](/..//evil.com/x)',
		'[x](/.\\\\/evil.com/x)',
		'[x](https://site.dev//evil.com/x)'
	])('same-origin path that would render protocol-relative is text in %j', (md) => {
		for (const opts of [SAME, ANY]) {
			expect(parseAnswer(md, opts)).toEqual([{ t: 'p', c: [{ t: 'text', v: 'x' }] }]);
		}
	});

	// `\/` is a markdown escape and `\\/` a literal backslash: both resolve to evil.com itself,
	// so these are ordinary cross-origin links rather than same-origin paths.
	it.each(['[x](/\\/evil.com)', '[x](/\\\\/evil.com)'])(
		'slash-backslash href %j is treated as another host',
		(md) => {
			expect(parseAnswer(md, SAME)).toEqual([{ t: 'p', c: [{ t: 'text', v: 'x' }] }]);
			expect(links(parseAnswer(md, ANY))[0]).toMatchObject({
				href: 'https://evil.com/',
				external: true
			});
		}
	);

	it('a double slash later in a same-origin path still links', () => {
		for (const opts of [SAME, ANY]) {
			expect(links(parseAnswer('[x](/a//b)', opts))[0]).toMatchObject({
				href: '/a//b',
				external: false
			});
		}
	});

	it('autolink to another host is text under same-origin', () => {
		const out = parseAnswer('see https://other.dev now', SAME);
		expect(links(out)).toHaveLength(0);
		expect(plain(out)).toBe('see https://other.dev now');
	});

	it('autolink to another host is an external link under any', () => {
		const out = parseAnswer('see https://other.dev now', ANY);
		expect(links(out)).toEqual([
			{
				t: 'link',
				href: 'https://other.dev/',
				external: true,
				c: [{ t: 'text', v: 'https://other.dev' }]
			}
		]);
	});

	it('external markdown link is text under same-origin', () => {
		const out = parseAnswer('[phish](https://evil.dev/login)', SAME);
		expect(out).toEqual([{ t: 'p', c: [{ t: 'text', v: 'phish' }] }]);
	});

	it('same scheme+host but other port is external', () => {
		expect(links(parseAnswer('[x](https://site.dev:8443/)', SAME))).toHaveLength(0);
		expect(links(parseAnswer('[x](http://site.dev/)', SAME))).toHaveLength(0);
	});
});

describe('parseAnswer — structure', () => {
	it('fenced code keeps its language', () => {
		const out = parseAnswer('```ts\nconst a = 1;\n```', SAME);
		expect(out).toEqual([{ t: 'code', lang: 'ts', v: 'const a = 1;' }]);
	});

	it('fenced code without a language omits lang', () => {
		const out = parseAnswer('```\n<script>x</script>\n```', SAME);
		expect(out).toEqual([{ t: 'code', v: '<script>x</script>' }]);
	});

	it('headings keep their level', () => {
		const out = parseAnswer('# One\n\n### Three *em*', SAME);
		expect(out).toEqual([
			{ t: 'h', level: 1, c: [{ t: 'text', v: 'One' }] },
			{
				t: 'h',
				level: 3,
				c: [
					{ t: 'text', v: 'Three ' },
					{ t: 'em', c: [{ t: 'text', v: 'em' }] }
				]
			}
		]);
	});

	it('nested lists', () => {
		const out = parseAnswer('1. a\n   - b\n   - c\n2. d', SAME);
		expect(out).toEqual([
			{
				t: 'list',
				ordered: true,
				start: 1,
				items: [
					[
						{ t: 'p', c: [{ t: 'text', v: 'a' }] },
						{
							t: 'list',
							ordered: false,
							items: [
								[{ t: 'p', c: [{ t: 'text', v: 'b' }] }],
								[{ t: 'p', c: [{ t: 'text', v: 'c' }] }]
							]
						}
					],
					[{ t: 'p', c: [{ t: 'text', v: 'd' }] }]
				]
			}
		]);
	});

	it('ordered list keeps a non-1 start', () => {
		const out = parseAnswer('3. x\n4. y', SAME);
		expect(out[0]).toMatchObject({ t: 'list', ordered: true, start: 3 });
	});

	it('inline code, strong, del, br, quote, hr', () => {
		const out = parseAnswer('**b** ~~d~~ `c<i>`  \nnext\n\n> q\n\n---', SAME);
		expect(out).toEqual([
			{
				t: 'p',
				c: [
					{ t: 'strong', c: [{ t: 'text', v: 'b' }] },
					{ t: 'text', v: ' ' },
					{ t: 'del', c: [{ t: 'text', v: 'd' }] },
					{ t: 'text', v: ' ' },
					{ t: 'code', v: 'c<i>' },
					{ t: 'br' },
					{ t: 'text', v: 'next' }
				]
			},
			{ t: 'quote', c: [{ t: 'p', c: [{ t: 'text', v: 'q' }] }] },
			{ t: 'hr' }
		]);
	});

	it('escapes and entities become plain characters', () => {
		const out = parseAnswer('a \\* b &amp; c &#60;', SAME);
		expect(plain(out)).toBe('a * b & c <');
	});

	it('tables become paragraphs of cell text', () => {
		const out = parseAnswer('| a | b |\n|---|---|\n| 1 | [x](https://evil.dev) |', SAME);
		expect(out.every((b) => b.t === 'p')).toBe(true);
		expect(plain(out)).toContain('a');
		expect(plain(out)).toContain('1');
		expect(links(out)).toHaveLength(0);
	});

	it('empty input yields no blocks', () => {
		expect(parseAnswer('', SAME)).toEqual([]);
	});
});
