/**
 * The shared extractor (spec §3.4 "Extraction rules"). Run by the server on HTML parsed with
 * linkedom and by the widget on the live DOM, so both see the same page. Browser-safe: no
 * node imports, no parser import — it takes a Document.
 */
import type { Heading } from '../shared/types.js';

export interface Extracted {
	title: string;
	description?: string;
	headings: Heading[];
	text: string;
}

const ELEMENT = 1;
const TEXT = 3;

const DROPPED_TAGS = new Set(['nav', 'aside', 'script', 'style', 'noscript', 'template']);
const LANDMARK_TAGS = new Set(['header', 'footer']);
const LANDMARK_CONTAINERS = new Set(['main', 'article', 'section']);
const HEADING_LEVELS: Record<string, 1 | 2 | 3> = { h1: 1, h2: 2, h3: 3 };

/** Elements whose content is separated from its neighbours by a line break. */
const BLOCK_TAGS = new Set([
	'address', 'article', 'aside', 'blockquote', 'body', 'caption', 'dd', 'details', 'dialog',
	'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3',
	'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'legend', 'li', 'main', 'menu', 'nav', 'ol',
	'p', 'pre', 'section', 'summary', 'table', 'tbody', 'tfoot', 'thead', 'tr', 'ul'
]);
/** Elements whose content is separated from its neighbours by a space. */
const SPACED_TAGS = new Set(['td', 'th', 'option']);

const tagOf = (el: Element): string => el.tagName.toLowerCase();

function hasAncestor(el: Element, tags: Set<string>): boolean {
	for (let p = el.parentElement; p; p = p.parentElement) if (tags.has(tagOf(p))) return true;
	return false;
}

function isDropped(el: Element): boolean {
	const tag = tagOf(el);
	if (DROPPED_TAGS.has(tag)) return true;
	if (el.hasAttribute('data-aide-ignore')) return true;
	if (el.getAttribute('aria-hidden') === 'true') return true;
	if (LANDMARK_TAGS.has(tag) && !hasAncestor(el, LANDMARK_CONTAINERS)) return true;
	return false;
}

/** Collapses whitespace: single spaces inside a line, one `\n` between blocks, trimmed. */
function normalize(raw: string): string {
	return raw
		.split('\n')
		.map((line) => line.replace(/ +/g, ' ').trim())
		.filter((line) => line.length > 0)
		.join('\n');
}

/** Appends the kept text of `node`'s children to `out`, collecting headings. Read-only walk. */
function walk(node: Node, out: string[], headings: Heading[] | null): void {
	for (let child = node.firstChild; child; child = child.nextSibling) {
		if (child.nodeType === TEXT) {
			out.push((child.nodeValue ?? '').replace(/\s+/g, ' '));
			continue;
		}
		if (child.nodeType !== ELEMENT) continue;
		const el = child as Element;
		if (isDropped(el)) continue;
		const tag = tagOf(el);
		if (tag === 'br') {
			out.push('\n');
			continue;
		}
		const sep = BLOCK_TAGS.has(tag) ? '\n' : SPACED_TAGS.has(tag) ? ' ' : '';
		const level = HEADING_LEVELS[tag];
		if (level && headings) {
			const inner: string[] = [];
			walk(el, inner, null);
			const text = normalize(inner.join('')).replace(/\n/g, ' ');
			if (text) headings.push({ level, text });
			out.push(sep, ...inner, sep);
			continue;
		}
		out.push(sep);
		walk(el, out, headings);
		out.push(sep);
	}
}

/** The outermost `[data-aide]` elements, in document order. */
function markedRoots(doc: Document): Element[] {
	const all = Array.from(doc.querySelectorAll('[data-aide]'));
	return all.filter((el) => {
		for (let p = el.parentElement; p; p = p.parentElement) {
			if (p.hasAttribute('data-aide')) return false;
		}
		return true;
	});
}

function metaDescription(doc: Document): string | undefined {
	for (const meta of Array.from(doc.querySelectorAll('meta'))) {
		if ((meta.getAttribute('name') ?? '').toLowerCase() !== 'description') continue;
		const content = normalize((meta.getAttribute('content') ?? '').replace(/\s+/g, ' '));
		return content || undefined;
	}
	return undefined;
}

/**
 * Pure DOM walk; works on linkedom's Document and a browser Document. Does not mutate the
 * input: dropped subtrees are skipped during the walk rather than removed.
 */
export function extract(doc: Document): Extracted {
	const marked = markedRoots(doc);
	const main = doc.querySelector('main');
	const fallback: Element | null = main ?? doc.body ?? doc.documentElement;
	const roots: Element[] = marked.length ? marked : fallback ? [fallback] : [];

	const out: string[] = [];
	const headings: Heading[] = [];
	for (const root of roots) {
		out.push('\n');
		walk(root, out, headings);
		out.push('\n');
	}
	const text = normalize(out.join(''));

	const titleEl = doc.querySelector('title');
	const titleText = normalize((titleEl?.textContent ?? '').replace(/\s+/g, ' '));
	const title = titleText || headings.find((h) => h.level === 1)?.text || '';

	const description = metaDescription(doc);
	return description === undefined
		? { title, headings, text }
		: { title, description, headings, text };
}

/** True when the extracted text is too short to answer from (spec §3.4, `limits.minPageChars`). */
export function isThin(text: string, minPageChars: number): boolean {
	return text.trim().length < minPageChars;
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/** FNV-1a 64 over the UTF-8 bytes, as 16 lowercase hex chars. Sync and browser-safe. */
export function hashText(text: string): string {
	let hash = FNV_OFFSET;
	for (const byte of new TextEncoder().encode(text)) {
		hash ^= BigInt(byte);
		hash = (hash * FNV_PRIME) & MASK_64;
	}
	return hash.toString(16).padStart(16, '0');
}
