/**
 * Reading one page (spec §3.4 "Reading one page", "What is cached", "llms.txt, read"). Server
 * only: HTML is parsed with linkedom. Every read goes through the transport, so it is anonymous
 * and carries the internal marker.
 */
import { parseHTML } from 'linkedom';
import type { Limits } from '../shared/limits';
import type { Heading, PageEntry } from '../shared/types';
import type { WaitUntil } from '../server/background';
import type { PageCache } from './cache';
import { extract, hashText, isThin, type Extracted } from './extract';
import { markdownPathFor, routeForMarkdownPath } from './llms';
import { IN_PROCESS_ORIGIN } from './route';
import type { Transport } from './transport';

export interface Reader {
	/**
	 * Cache hit fresh → entry; stale → entry + background refresh via `waitUntil`; miss cached →
	 * null; else the `.md` twin (when `preferMarkdown`), then the HTML. Concurrent reads of one
	 * route share one promise. Text is truncated to `limits.pageChars`.
	 */
	readPage(route: string, opts?: { waitUntil?: WaitUntil }): Promise<PageEntry | null>;
	/**
	 * Links found in the last read of a route (HTML `a[href]` not `rel~=nofollow`, or markdown
	 * links), for the crawler. Relative hrefs are made root-relative against the page; absolute
	 * ones are returned as written. Nothing is filtered here: the crawler applies `acceptHref`.
	 */
	links(route: string): string[];
}

const HTML_ACCEPT = 'text/html';
const MARKDOWN_ACCEPT = 'text/markdown';
const FENCE_RE = /^\s*(```|~~~)/;
const MD_HEADING_RE = /^(#{1,3})\s+(.*?)\s*#*\s*$/;
const MD_LINK_RE = /\[(?:\\.|[^\]\\])*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;

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
		const h = MD_HEADING_RE.exec(line);
		if (h) {
			const level = h[1]!.length as 1 | 2 | 3;
			const text = h[2]!.replace(/\s+/g, ' ').trim();
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

/**
 * Markdown links, `.md` twins (relative or absolute) mapped to their page route. The mapping
 * works on the URL-encoded path as written and never decodes, so an encoded route such as
 * `/%61pi/x.md` → `/%61pi/x` is left for the crawler's `acceptHref`, which judges the
 * SvelteKit-decoded form (`/api/x`) and refuses it.
 */
function markdownLinks(markdown: string, pageRoute: string): string[] {
	const out: string[] = [];
	for (const m of markdown.matchAll(MD_LINK_RE)) {
		const href = relativize(m[1] ?? '', pageRoute);
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
	now?: () => number;
}): Reader {
	const { transport, cache, limits } = opts;
	const now = opts.now ?? Date.now;
	const inflight = new Map<string, Promise<PageEntry | null>>();
	const linkMap = new Map<string, string[]>();

	function remember(route: string, links: string[]): void {
		linkMap.delete(route);
		linkMap.set(route, links);
		// Bounded like the cache: links of routes long gone are dropped oldest first.
		while (linkMap.size > Math.max(1, limits.maxPages)) linkMap.delete(linkMap.keys().next().value as string);
	}

	/** One read from the site. `refresh`: a network failure keeps the stale entry. */
	async function load(route: string, refresh: boolean): Promise<PageEntry | null> {
		if (opts.preferMarkdown) {
			const md = await transport.read(markdownPathFor(route), MARKDOWN_ACCEPT);
			if (md.ok && md.contentType === 'markdown') {
				const entry = toEntry(route, pageFromMarkdown(md.body), 'markdown', limits, now());
				remember(route, markdownLinks(md.body, route));
				await cache.set(route, entry);
				return entry;
			}
		}
		const res = await transport.read(route, HTML_ACCEPT);
		if (!res.ok || res.contentType !== 'html') {
			if (refresh && !res.ok && res.reason === 'network') return null;
			await cache.setMiss(route);
			return null;
		}
		const { document } = parseHTML(res.body);
		const doc = document as unknown as Document;
		const entry = toEntry(route, extract(doc), 'render', limits, now());
		remember(route, htmlLinks(doc, res.finalRoute));
		await cache.set(route, entry);
		return entry;
	}

	function shared(route: string, refresh: boolean): Promise<PageEntry | null> {
		let p = inflight.get(route);
		if (!p) {
			p = load(route, refresh)
				.catch(() => null)
				.finally(() => inflight.delete(route));
			inflight.set(route, p);
		}
		return p;
	}

	return {
		async readPage(route, readOpts) {
			const hit = await cache.get(route);
			if (hit && 'entry' in hit) {
				if (hit.stale && !inflight.has(route)) {
					const refresh = shared(route, true);
					if (readOpts?.waitUntil) readOpts.waitUntil(refresh);
				}
				return hit.entry;
			}
			if (hit) return null;
			return shared(route, false);
		},

		links(route) {
			return [...(linkMap.get(route) ?? [])];
		}
	};
}
