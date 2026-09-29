import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { Window } from 'happy-dom';
import { extract, hashText, isThin, type Extracted } from '../../../src/site/extract';
import * as publicEntry from '../../../src/extract/index';

const fixture = (name: string): string =>
	readFileSync(fileURLToPath(new URL(`../../fixtures/html/${name}.html`, import.meta.url)), 'utf8');

const windows: Window[] = [];
afterAll(async () => {
	await Promise.all(windows.map((w) => w.happyDOM.close()));
});

function linkedomDoc(html: string): Document {
	return parseHTML(html).document as unknown as Document;
}

function happyDoc(html: string): Document {
	const window = new Window({ settings: { disableJavaScriptEvaluation: true } });
	windows.push(window);
	window.document.write(html);
	return window.document as unknown as Document;
}

/** Runs the fixture through both DOMs, asserts they agree, returns the result. */
function both(name: string): Extracted {
	const html = fixture(name);
	const a = extract(linkedomDoc(html));
	const b = extract(happyDoc(html));
	expect(b).toEqual(a);
	return a;
}

describe('extract', () => {
	it('uses <main> when present, with title, description and h1–h3', () => {
		expect(both('main')).toEqual({
			title: 'Pricing | Acme',
			description: 'Plans and prices for Acme.',
			headings: [
				{ level: 1, text: 'Pricing' },
				{ level: 2, text: 'Starter' },
				{ level: 3, text: 'Limits' }
			],
			text: 'Pricing\nChoose a plan that fits you.\nStarter\nFree forever.\nLimits\nOne site\nTen pages\nFine print\nNo refunds.'
		});
	});

	it('falls back to <body> and separates blocks with newlines', () => {
		expect(both('body')).toEqual({
			title: 'Plain page',
			headings: [{ level: 1, text: 'Welcome' }],
			text: 'Welcome\nFirst block\nSecond block\nLine one\nLine two\ninlinejoined'
		});
	});

	it('drops data-aide-ignore, nav, aside, script, style, noscript, template, aria-hidden', () => {
		const r = both('dropped');
		expect(r.text).toBe('Kept heading\nKept paragraph.\nVisible aria text\nAfter ignored gone.');
		expect(r.headings).toEqual([{ level: 1, text: 'Kept heading' }]);
		expect(r.description).toBeUndefined();
	});

	it('drops landmark header/footer but keeps them inside main, article, section', () => {
		const r = both('landmarks');
		expect(r.title).toBe('Blog post');
		expect(r.headings).toEqual([{ level: 1, text: 'Article title' }]);
		expect(r.text).toBe(
			'Article title\nBy Ada\nArticle body.\nArticle footer\nSection footer\nMain header'
		);
	});

	it('keeps only [data-aide] subtrees when any exist, concatenated', () => {
		expect(both('data-aide')).toEqual({
			title: 'Marked',
			description: 'Only marked parts.',
			headings: [
				{ level: 2, text: 'First part' },
				{ level: 3, text: 'Second part' }
			],
			text: 'First part\nAlpha text.\nNested part.\nSecond part\nBeta text.'
		});
	});

	it('falls back to the first h1 for the title; empty description is omitted', () => {
		const r = both('no-title');
		expect(r.title).toBe('Fallback title');
		expect(r.description).toBeUndefined();
		expect(r.headings).toEqual([{ level: 1, text: 'Fallback title' }]);
		expect(r.text).toBe('Fallback title\nShort.');
	});

	it('does not mutate the input document', () => {
		for (const name of ['main', 'dropped', 'landmarks', 'data-aide']) {
			const html = fixture(name);
			for (const doc of [linkedomDoc(html), happyDoc(html)]) {
				const before = doc.documentElement.outerHTML;
				extract(doc);
				expect(doc.documentElement.outerHTML).toBe(before);
			}
		}
	});
});

describe('isThin', () => {
	it('is thin below the threshold only', () => {
		expect(isThin('a'.repeat(199), 200)).toBe(true);
		expect(isThin('a'.repeat(200), 200)).toBe(false);
		expect(isThin('', 200)).toBe(true);
	});
});

describe('hashText', () => {
	it('is FNV-1a 64 as 16 hex chars, stable', () => {
		expect(hashText('')).toBe('cbf29ce484222325');
		expect(hashText('a')).toBe('af63dc4c8601ec8c');
		expect(hashText('hello world')).toBe(hashText('hello world'));
		expect(hashText('hello world')).not.toBe(hashText('hello world!'));
		expect(hashText('é ✓')).toMatch(/^[0-9a-f]{16}$/);
	});
});

describe('public entry', () => {
	it('re-exports the extractor', () => {
		expect(publicEntry.extract).toBe(extract);
		expect(publicEntry.isThin).toBe(isThin);
		expect(publicEntry.hashText).toBe(hashText);
	});
});
