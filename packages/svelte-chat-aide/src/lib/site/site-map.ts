/**
 * The run-time site map (spec §3.4 "Discovering the pages", "llms.txt, read", "The exception").
 * A bounded, same-site, breadth-first crawl through `readPage`, seeded by `/`, the sitemap,
 * `pages.include` and the site's own llms.txt. Nothing is written to disk.
 */
import type { PageEntry, ResolvedConfig } from '../shared/types';
import type { WaitUntil } from '../server/background';
import type { PageCache } from './cache';
import { hashText, isThin } from './extract';
import {
	outlineFrom,
	parseLlmsTxt,
	routeForMarkdownPath,
	splitLlmsFull,
	type LlmsDoc,
	type MapPage,
	type SiteInfo
} from './llms';
import { pageFromMarkdown, toEntry, type Reader } from './read-page';
import { IN_PROCESS_ORIGIN, acceptHref, acceptRoute } from './route';
import type { Transport } from './transport';

export interface SiteMap {
	/** Idempotent; starts the crawl on the first call, and again once the last one is older than the TTL. */
	ensureStarted(waitUntil: WaitUntil): void;
	/** Resolves when the map is complete, or after `ms`. */
	waitFor(ms: number): Promise<void>;
	/** True once the outline is whole: the first crawl finished, or the site's llms.txt was read and has at least one usable link. */
	complete(): boolean;
	site(): SiteInfo;
	/** Mapped pages, in crawl / llms.txt order. */
	pages(): MapPage[];
	outline(maxChars: number): { text: string; partial: boolean };
	/** `pages.source` when set, else the reader. Routes are checked with the route rule first. */
	readForTool(route: string): Promise<PageEntry | null>;
	isMapped(route: string): boolean;
}

const LLMS_ACCEPT = 'text/plain, text/markdown';
const SITEMAP_ACCEPT = 'application/xml, text/xml';
const LOC_RE = /<loc>\s*([^<]*?)\s*<\/loc>/gi;
const noop = () => {};

/** Per-crawl state; the first crawl is published live, a revisit is swapped in when it ends. */
interface MapState {
	order: Map<string, MapPage>;
	/** The site's own llms.txt, its links narrowed to accepted routes (possibly none). */
	llms?: LlmsDoc;
}

/** The site's llms.txt is the outline base only when at least one of its links survived. */
function usableLlms(state: MapState): LlmsDoc | undefined {
	return state.llms && state.llms.links.length > 0 ? state.llms : undefined;
}

function decodeXml(s: string): string {
	return s
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&');
}

function toMapPage(entry: PageEntry, fromSource: boolean, description?: string): MapPage {
	const page: MapPage = {
		route: entry.route,
		title: entry.title || entry.route,
		headings: entry.headings,
		text: entry.text,
		fromSource
	};
	const d = entry.description ?? description;
	if (d) page.description = d;
	return page;
}

export function createSiteMap(opts: {
	reader: Reader;
	transport: Transport;
	cache: PageCache;
	config: ResolvedConfig;
	now?: () => number;
}): SiteMap {
	const { reader, transport, cache, config } = opts;
	const now = opts.now ?? Date.now;
	const { limits } = config;
	const origin = config.origin;
	const base = (origin ?? IN_PROCESS_ORIGIN) + '/';
	const exclude = config.pages.exclude;
	const ttlMs = config.cache.ttlSeconds * 1000;

	let current: MapState = { order: new Map() };
	let isComplete = false;
	let running: Promise<void> | null = null;
	let finishedAt: number | null = null;
	let lastWaitUntil: WaitUntil | undefined;
	let signalComplete: () => void = noop;
	const completed = new Promise<void>((r) => (signalComplete = r));
	let source: Map<string, PageEntry> | null = null;

	function markComplete(): void {
		isComplete = true;
		signalComplete();
	}

	const href = (h: string) => acceptHref(h, { origin, base, exclude });

	/**
	 * A link from llms.txt / llms-full.txt: resolved against the site, a `.md` twin
	 * (`/docs/intro.md`, `/index.html.md`) mapped to its page route, then the route rule.
	 * Absolute links on another origin — including the site's own when no origin is configured,
	 * which cannot be verified — are dropped.
	 */
	const llmsHref = (h: string): string | null => {
		let url: URL;
		try {
			url = new URL(h, base);
		} catch {
			return null;
		}
		const route = routeForMarkdownPath(url.pathname);
		if (route !== null) url.pathname = route;
		return href(url.href);
	};

	// ------------------------------------------------------------ pages.source

	async function loadSource(): Promise<Map<string, PageEntry>> {
		const out = new Map<string, PageEntry>();
		let list: unknown;
		try {
			list = await config.pages.source!();
		} catch {
			list = [];
		}
		if (!Array.isArray(list)) return out;
		const at = now();
		for (const p of list) {
			if (!p || typeof p !== 'object') continue;
			const route = acceptRoute(p.route, { origin, exclude });
			if (route === null || out.has(route) || out.size >= limits.maxPages) continue;
			const text = String(p.text ?? '').slice(0, limits.pageChars);
			const entry: PageEntry = {
				route,
				title: String(p.title ?? ''),
				headings: Array.isArray(p.headings) ? p.headings : [],
				text,
				hash: hashText(text),
				thin: isThin(text, limits.minPageChars),
				source: 'source',
				fetchedAt: at
			};
			if (typeof p.description === 'string' && p.description) entry.description = p.description;
			out.set(route, entry);
		}
		return out;
	}

	async function runSource(): Promise<void> {
		const entries = await loadSource();
		source = entries;
		const order = new Map<string, MapPage>();
		for (const e of entries.values()) order.set(e.route, toMapPage(e, true));
		current = { order };
	}

	// ------------------------------------------------------------ crawl

	async function readLlms(state: MapState): Promise<string[]> {
		if (!config.llms.read) return [];
		const seeds: string[] = [];
		const res = await transport.read('/llms.txt', LLMS_ACCEPT);
		if (res.ok && (res.contentType === 'text' || res.contentType === 'markdown')) {
			const doc = parseLlmsTxt(res.body);
			if (doc.title) {
				const links = [];
				const later: string[] = [];
				for (const link of doc.links) {
					const route = llmsHref(link.url);
					if (route === null) continue;
					links.push({ ...link, url: route });
					(link.optional ? later : seeds).push(route);
					if (!state.order.has(route) && state.order.size < limits.maxPages) {
						const page: MapPage = { route, title: link.title, headings: [], text: '', fromSource: false };
						if (link.description) page.description = link.description;
						state.order.set(route, page);
					}
				}
				seeds.push(...later);
				state.llms = { ...doc, links };
			}
		}

		const full = await transport.read('/llms-full.txt', LLMS_ACCEPT);
		if (full.ok && (full.contentType === 'text' || full.contentType === 'markdown')) {
			for (const chunk of splitLlmsFull(full.body, [...state.order.keys()])) {
				if (!chunk.route) continue;
				const route = llmsHref(chunk.route);
				if (route === null) continue;
				const entry = toEntry(route, pageFromMarkdown(chunk.text, chunk.title), 'llms-full', limits, now());
				entry.title = chunk.title || entry.title;
				await cache.set(route, entry);
				if (!state.order.has(route) && state.order.size < limits.maxPages) {
					state.order.set(route, toMapPage(entry, false));
					seeds.push(route);
				}
			}
		}
		return seeds;
	}

	async function readSitemap(): Promise<string[]> {
		const res = await transport.read('/sitemap.xml', SITEMAP_ACCEPT);
		if (!res.ok || res.contentType !== 'xml') return [];
		const out: string[] = [];
		for (const m of res.body.matchAll(LOC_RE)) {
			const route = href(decodeXml(m[1] ?? ''));
			if (route !== null) out.push(route);
		}
		return out;
	}

	async function crawl(state: MapState, first: boolean, waitUntil: WaitUntil): Promise<void> {
		const llmsSeeds = await readLlms(state);
		// A site with its own usable llms.txt has a whole outline before any page is rendered.
		if (first && usableLlms(state)) markComplete();

		const seeds = ['/', ...(await readSitemap())];
		for (const r of config.pages.include) {
			const route = acceptRoute(r, { origin, exclude });
			if (route !== null) seeds.push(route);
		}
		seeds.push(...llmsSeeds);

		const queue: string[] = [];
		const seen = new Set<string>();
		const enqueue = (route: string | null) => {
			if (route === null || seen.has(route) || seen.size >= limits.maxPages) return;
			seen.add(route);
			queue.push(route);
		};
		const root = acceptRoute('/', { origin, exclude });
		for (const s of seeds) enqueue(s === '/' ? root : s);

		const visit = async (route: string) => {
			const entry = await reader.readPage(route, { waitUntil });
			if (!entry) {
				state.order.delete(route);
				return;
			}
			const prior = state.order.get(route);
			state.order.set(route, toMapPage(entry, false, prior?.description));
			for (const link of reader.links(route)) enqueue(href(link));
		};

		// A pool of `crawlConcurrency` reads; each finished read may enqueue more.
		const width = Math.max(1, limits.crawlConcurrency);
		await new Promise<void>((resolve) => {
			let active = 0;
			const pump = () => {
				while (active < width && queue.length > 0) {
					const route = queue.shift()!;
					active++;
					visit(route)
						.catch(noop) // one page never stops the crawl
						.finally(() => {
							active--;
							pump();
						});
				}
				if (active === 0 && queue.length === 0) resolve();
			};
			pump();
		});
	}

	function start(waitUntil: WaitUntil): void {
		const first = finishedAt === null;
		const state: MapState = first ? current : { order: new Map() };
		const run = (async () => {
			try {
				if (config.pages.source) await runSource();
				else await crawl(state, first, waitUntil);
			} catch {
				/* the map stays as it was */
			}
			if (!config.pages.source) current = state;
			finishedAt = now();
			markComplete();
		})().finally(() => {
			running = null;
		});
		running = run;
		waitUntil(run);
	}

	/** The mapped page, its text and metadata taken from the cache when a fresher read is there. */
	function live(page: MapPage): MapPage {
		if (page.fromSource) return page;
		const rec = cache.peek(page.route);
		return rec?.kind === 'page' ? toMapPage(rec.entry, false, page.description) : page;
	}

	function siteInfo(): SiteInfo {
		const rootPage = current.order.get('/');
		const root = rootPage ? live(rootPage) : undefined;
		const title = current.llms?.title || root?.title || '';
		const summary = current.llms?.summary ?? (config.facts.length ? config.facts.join(' ') : root?.description);
		return summary ? { title, summary } : { title };
	}

	function pages(): MapPage[] {
		return [...current.order.values()].map(live);
	}

	return {
		ensureStarted(waitUntil) {
			lastWaitUntil = waitUntil;
			if (running) return;
			if (finishedAt !== null && now() - finishedAt <= ttlMs) return;
			start(waitUntil);
		},

		waitFor(ms) {
			if (isComplete) return Promise.resolve();
			let timer: ReturnType<typeof setTimeout> | undefined;
			const timeout = new Promise<void>((r) => (timer = setTimeout(r, Math.max(0, ms))));
			return Promise.race([completed, timeout]).finally(() => clearTimeout(timer));
		},

		complete: () => isComplete,

		site: siteInfo,

		pages,

		outline(maxChars) {
			const { text } = outlineFrom(siteInfo(), pages(), { maxChars, withHeadings: true }, usableLlms(current));
			return { text, partial: !isComplete };
		},

		async readForTool(route) {
			const accepted = acceptRoute(route, { origin, exclude });
			if (accepted === null) return null;
			if (config.pages.source) {
				if (!source) {
					if (running) await running;
					source ??= await loadSource();
				}
				return source.get(accepted) ?? null;
			}
			return reader.readPage(accepted, { waitUntil: lastWaitUntil });
		},

		isMapped(route) {
			return current.order.has(route);
		}
	};
}
