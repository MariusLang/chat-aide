/**
 * Reading one page (spec §3.4 "Reading one page", "What is cached", "llms.txt, read"). Server
 * only: HTML is parsed with linkedom. Every read goes through the transport, so it is anonymous
 * and carries the internal marker.
 *
 * A page that asks not to be indexed (`site/robots.ts`) is read to find that out and then
 * dropped: no entry, no cached text, only a `noindex` mark in the cache.
 */
import { parseHTML } from 'linkedom';
import type { Limits } from '../shared/limits.js';
import type { Heading, PageEntry } from '../shared/types.js';
import type { WaitUntil } from '../server/background.js';
import type { PageCache } from './cache.js';
import { extract, hashText, isThin, type Extracted } from './extract.js';
import { atxHeading, linkTextEnd, markdownPathFor, routeForMarkdownPath, skipSpace } from './llms.js';
import { pageRobots, type Robots } from './robots.js';
import { IN_PROCESS_ORIGIN } from './route.js';
import type { Transport } from './transport.js';

/** One read: the entry, or none. `noindex` says the page was there and asked not to be indexed. */
export interface PageRead {
	entry: PageEntry | null;
	noindex: boolean;
}

export interface Reader {
	/**
	 * Cache hit fresh → entry; stale → entry + background refresh via `waitUntil`; miss cached →
	 * none; else the `.md` twin (when `preferMarkdown`), then the HTML. Concurrent reads of one
	 * route share one promise. Text is truncated to `limits.pageChars`.
	 */
	read(route: string, opts?: { waitUntil?: WaitUntil }): Promise<PageRead>;
	/** The entry of `read`: null for an unreadable page and for a `noindex` one alike. */
	readPage(route: string, opts?: { waitUntil?: WaitUntil }): Promise<PageEntry | null>;
	/**
	 * Links found in the last read of a route (HTML `a[href]` not `rel~=nofollow`, or markdown
	 * links), for the crawler: none when the page says `nofollow`, and a `noindex` page still has
	 * its own. Relative hrefs are made root-relative against the page; absolute ones are returned
	 * as written. Nothing is filtered here: the crawler applies `acceptHref`.
	 */
	links(route: string): string[];
}

const HTML_ACCEPT = 'text/html';
const MARKDOWN_ACCEPT = 'text/markdown';
const FENCE_RE = /^\s*(```|~~~)/;
const HREF_CHARS_RE = /[^)\s>]*/y;
const MISS: PageRead = { entry: null, noindex: false };
const NOINDEX: PageRead = { entry: null, noindex: true };
const ALLOWED: Robots = { noindex: false, nofollow: false };

/** Title, description (a `>` line right after the H1), H1–H3 and the text of a markdown page. */
export function pageFromMarkdown(markdown: string, fallbackTitle = ''): Extracted {
	const lines = String(markdown ?? '')
		.replace(/\r\n?/g, '\n')
		.split('\n');
	const headings: Heading[] = [];
	let title = '';
	let description: string | undefined;
	let inFence = false;
	let afterTitle = false;
	for (const line of lines) {
		if (FENCE_RE.test(line)) inFence = !inFence;
		if (inFence) continue;
		const h = atxHeading(line);
		if (h && h.level <= 3) {
			const level = h.level as 1 | 2 | 3;
			const text = h.text.replace(/\s+/g, ' ').trim();
			if (text) headings.push({ level, text });
			if (level === 1 && !title && text) {
				title = text;
				afterTitle = true;
				continue;
			}
			afterTitle = false;
			continue;
		}
		if (afterTitle) {
			if (line.trim() === '') continue;
			const quote = /^>\s?(.*)$/.exec(line);
			if (quote && quote[1]!.trim()) description = quote[1]!.trim();
			afterTitle = false;
		}
	}
	const text = lines.join('\n').trim();
	const out: Extracted = { title: title || fallbackTitle, headings, text };
	if (description) out.description = description;
	return out;
}

/** Builds a cache entry from extracted content: text truncated to `pageChars`, hashed, thin marked. */
export function toEntry(
	route: string,
	page: Extracted,
	source: PageEntry['source'],
	limits: Pick<Limits, 'pageChars' | 'minPageChars'>,
	fetchedAt: number
): PageEntry {
	const text = page.text.slice(0, Math.max(0, limits.pageChars));
	const entry: PageEntry = {
		route,
		title: page.title,
		headings: page.headings,
		text,
		hash: hashText(text),
		thin: isThin(text, limits.minPageChars),
		source,
		fetchedAt
	};
	if (page.description) entry.description = page.description;
	return entry;
}

/**
 * Resolves `href` against the page. A relative href becomes root-relative (path + query + hash,
 * so the crawler can see and drop them); an absolute one is kept as written. Null for empty.
 */
function relativize(href: string, pageRoute: string): string | null {
	const raw = href.trim();
	if (!raw) return null;
	let absolute = false;
	try {
		new URL(raw);
		absolute = true;
	} catch {
		/* relative */
	}
	if (absolute) return raw;
	let url: URL;
	try {
		url = new URL(raw, IN_PROCESS_ORIGIN + pageRoute);
	} catch {
		return null;
	}
	if (url.origin !== IN_PROCESS_ORIGIN) return url.href; // protocol-relative to another host
	return url.pathname + url.search + url.hash;
}

function htmlLinks(doc: Document, pageRoute: string): string[] {
	const out: string[] = [];
	for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
		const rel = (a.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
		if (rel.includes('nofollow')) continue;
		const href = relativize(a.getAttribute('href') ?? '', pageRoute);
		if (href !== null) out.push(href);
	}
	return out;
}

/** The href whose `(` is just before `from`, with the index of its `)`; null when it is not one. */
function hrefAt(markdown: string, from: number): { href: string; end: number } | null {
	const start = skipSpace(markdown, from);
	HREF_CHARS_RE.lastIndex = start;
	HREF_CHARS_RE.test(markdown);
	const hrefEnd = HREF_CHARS_RE.lastIndex;
	if (hrefEnd === start) return null;
	const afterHref = markdown[hrefEnd] === '>' ? hrefEnd + 1 : hrefEnd;
	let end = skipSpace(markdown, afterHref);
	if (end > afterHref && markdown[end] === '"') {
		const quote = markdown.indexOf('"', end + 1);
		// Bounded: a title may not run past the line, so this never rescans the body.
		if (quote < 0 || quote - end > 512) return null;
		end = skipSpace(markdown, quote + 1);
	}
	if (markdown[end] !== ')') return null;
	const hrefStart = markdown[start] === '<' && hrefEnd > start + 1 ? start + 1 : start;
	return { href: markdown.slice(hrefStart, hrefEnd), end };
}

/**
 * The hrefs of `[text](href)`, `[text](<href>)` and `[text](href "title")`, in one linear pass:
 * link text and hrefs may span the whole body, so nothing may be rescanned per `[`. All `[` before
 * a `]` close at that `]`, hence fail or match with the first; all hrefs running to the same stop
 * character have the same continuation, hence fail with the first.
 */
export function markdownHrefs(markdown: string): string[] {
	const out: string[] = [];
	let failedHrefEnd = 0;
	let pos = 0;
	for (;;) {
		const open = markdown.indexOf('[', pos);
		if (open < 0) return out;
		const close = linkTextEnd(markdown, open + 1);
		pos = close + 1;
		if (markdown[close] !== ']' || markdown[pos] !== '(') continue;
		const start = skipSpace(markdown, pos + 1);
		if (start < failedHrefEnd) continue;
		HREF_CHARS_RE.lastIndex = start;
		HREF_CHARS_RE.test(markdown);
		const hrefEnd = HREF_CHARS_RE.lastIndex;
		if (hrefEnd === start) continue;
		const afterHref = markdown[hrefEnd] === '>' ? hrefEnd + 1 : hrefEnd;
		let end = skipSpace(markdown, afterHref);
		if (end > afterHref && markdown[end] === '"') {
			const quote = markdown.indexOf('"', end + 1);
			if (quote < 0) {
				failedHrefEnd = hrefEnd;
				continue;
			}
			end = skipSpace(markdown, quote + 1);
		}
		if (markdown[end] !== ')') {
			failedHrefEnd = hrefEnd;
			continue;
		}
		const hrefStart = markdown[start] === '<' && hrefEnd > start + 1 ? start + 1 : start;
		out.push(markdown.slice(hrefStart, hrefEnd));
		pos = end + 1;
		// `[![alt](image)](href)`: the outer link's text closed at the image's `]`, so its href
		// follows right here. Reading it as a link text start keeps the pass linear.
		if (markdown[pos] === ']' && markdown[pos + 1] === '(') {
			const outer = hrefAt(markdown, pos + 2);
			if (outer) {
				out.push(outer.href);
				pos = outer.end + 1;
			}
		}
	}
}

/**
 * Markdown links, `.md` twins (relative or absolute) mapped to their page route. The mapping
 * works on the URL-encoded path as written and never decodes, so an encoded route such as
 * `/%61pi/x.md` → `/%61pi/x` is left for the crawler's `acceptHref`, which judges the
 * SvelteKit-decoded form (`/api/x`) and refuses it.
 */
function markdownLinks(markdown: string, pageRoute: string): string[] {
	const out: string[] = [];
	for (const raw of markdownHrefs(markdown)) {
		const href = relativize(raw, pageRoute);
		if (href === null) continue;
		if (href.startsWith('/')) {
			const path = href.replace(/[?#].*$/, '');
			const route = routeForMarkdownPath(path);
			out.push(route === null ? href : route + href.slice(path.length));
			continue;
		}
		let url: URL | null = null;
		try {
			url = new URL(href);
		} catch {
			/* kept as written */
		}
		const route = url && /^https?:$/.test(url.protocol) ? routeForMarkdownPath(url.pathname) : null;
		if (url && route !== null) {
			url.pathname = route;
			out.push(url.href);
		} else out.push(href);
	}
	return out;
}

export function createReader(opts: {
	transport: Transport;
	cache: PageCache;
	limits: Limits;
	preferMarkdown: boolean;
	/** `pages.respectNoindex` (default true). */
	respectNoindex?: boolean;
	now?: () => number;
}): Reader {
	const { transport, cache, limits } = opts;
	const respect = opts.respectNoindex ?? true;
	const now = opts.now ?? Date.now;
	const inflight = new Map<string, Promise<PageRead>>();
	const linkMap = new Map<string, string[]>();

	function remember(route: string, links: string[]): void {
		linkMap.delete(route);
		linkMap.set(route, links);
		// Bounded like the cache: links of routes long gone are dropped oldest first.
		while (linkMap.size > Math.max(1, limits.maxPages)) linkMap.delete(linkMap.keys().next().value as string);
	}

	async function keep(route: string, entry: PageEntry, links: string[]): Promise<PageRead> {
		remember(route, links);
		// The links go into the cache with the page, so an instance that reads it from a shared
		// store can still crawl on from it.
		const kept: PageEntry = { ...entry, links };
		await cache.set(route, kept);
		return { entry: kept, noindex: false };
	}

	/** One read from the site. `refresh`: a network failure keeps the stale entry. */
	async function load(route: string, refresh: boolean): Promise<PageRead> {
		let twin: string | null = null;
		if (opts.preferMarkdown) {
			const md = await transport.read(markdownPathFor(route), MARKDOWN_ACCEPT);
			if (md.ok && md.contentType === 'markdown') twin = md.body;
		}
		const twinEntry = (body: string) => toEntry(route, pageFromMarkdown(body), 'markdown', limits, now());
		if (twin !== null && !respect) return keep(route, twinEntry(twin), markdownLinks(twin, route));

		// A twin has no robots meta, and a `noindex` header on it is about the `.md` file, so the
		// page itself is still asked what it says to robots.
		const res = await transport.read(route, HTML_ACCEPT);
		const html = res.ok && res.contentType === 'html' ? res : null;
		if (!html) {
			const network = !res.ok && res.reason === 'network';
			// A twin whose page is not HTML stands alone; one whose page could not be reached waits.
			if (twin !== null && !network) return keep(route, twinEntry(twin), markdownLinks(twin, route));
			if (refresh && network) return MISS;
			await cache.setMiss(route);
			return MISS;
		}
		const { document } = parseHTML(html.body);
		const doc = document as unknown as Document;
		const robots = respect ? pageRobots(doc, html.robotsTag) : ALLOWED;
		const links = robots.nofollow ? [] : twin !== null ? markdownLinks(twin, route) : htmlLinks(doc, html.finalRoute);
		if (robots.noindex) {
			// Its links stay for the crawl; its text is dropped and only the mark is cached.
			remember(route, links);
			await cache.setNoindex(route);
			return NOINDEX;
		}
		const entry = twin !== null ? twinEntry(twin) : toEntry(route, extract(doc), 'render', limits, now());
		return keep(route, entry, links);
	}

	function shared(route: string, refresh: boolean): Promise<PageRead> {
		let p = inflight.get(route);
		if (!p) {
			p = load(route, refresh)
				.catch(() => MISS)
				.finally(() => inflight.delete(route));
			inflight.set(route, p);
		}
		return p;
	}

	async function read(route: string, readOpts?: { waitUntil?: WaitUntil }): Promise<PageRead> {
		const hit = await cache.get(route);
		if (hit && 'entry' in hit) {
			if (hit.stale && !inflight.has(route)) {
				const refresh = shared(route, true);
				if (readOpts?.waitUntil) readOpts.waitUntil(refresh);
			}
			if (!linkMap.has(route) && Array.isArray(hit.entry.links)) {
				remember(
					route,
					hit.entry.links.filter((l): l is string => typeof l === 'string')
				);
			}
			return { entry: hit.entry, noindex: false };
		}
		if (hit?.noindex && respect) return NOINDEX;
		// A `noindex` mark is for a reader that respects it; any other reads the page again.
		if (hit && !hit.noindex) return MISS;
		return shared(route, false);
	}

	return {
		read,

		async readPage(route, readOpts) {
			return (await read(route, readOpts)).entry;
		},

		links(route) {
			return [...(linkMap.get(route) ?? [])];
		}
	};
}
