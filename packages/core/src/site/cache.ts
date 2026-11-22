/**
 * The page cache (spec §3.4 "What is cached"). Pages and misses each have their own LRU bounded
 * by `limits.maxPages` (at most 2 × maxPages records), so a stream of invented routes can neither
 * grow the cache nor evict a crawled page. A stale page is kept until evicted; the
 * stale-while-revalidate decision belongs to `readPage`.
 *
 * A page that asked not to be indexed is kept as a miss marked `noindex`, with none of its text.
 * It is a page of the site, so the mark lives in the pages' LRU, where invented routes cannot
 * evict it.
 */
import { CACHE_DEFAULTS } from '../shared/limits.js';
import type { PageEntry, Store } from '../shared/types.js';

export type CacheRecord =
	| { kind: 'page'; entry: PageEntry }
	| { kind: 'miss'; expiresAt: number; noindex?: true };

export interface PageCache {
	get(route: string): Promise<{ entry: PageEntry; stale: boolean } | { miss: true; noindex?: true } | null>;
	set(route: string, entry: PageEntry): Promise<void>;
	/** Remembered for `missSeconds` (60 s), without a body. */
	setMiss(route: string): Promise<void>;
	/**
	 * A page that asked not to be indexed: a miss marked `noindex`, remembered for `ttlSeconds`.
	 * None of its text is kept, and a copy stored earlier is overwritten.
	 */
	setNoindex(route: string): Promise<void>;
	size(): number;
	/** Every cached route: pages and `noindex` marks, then misses, each in LRU order, most recent last. */
	routes(): string[];
	/** The raw in-memory record, without touching recency or the store. */
	peek(route: string): CacheRecord | undefined;
}

const PAGE_PREFIX = 'aide:page:';
const MISS_PREFIX = 'aide:miss:';
const SOURCES = new Set(['render', 'markdown', 'llms-full', 'source']);

function parseEntry(raw: string | null): PageEntry | null {
	if (raw === null) return null;
	try {
		const v = JSON.parse(raw) as Partial<PageEntry> | null;
		if (
			!v ||
			typeof v !== 'object' ||
			typeof v.route !== 'string' ||
			typeof v.title !== 'string' ||
			typeof v.text !== 'string' ||
			typeof v.hash !== 'string' ||
			typeof v.thin !== 'boolean' ||
			typeof v.fetchedAt !== 'number' ||
			!Array.isArray(v.headings) ||
			!SOURCES.has(v.source as string)
		) {
			return null;
		}
		return v as PageEntry;
	} catch {
		return null;
	}
}

function parseMiss(raw: string | null): { at: number; expiresAt: number; noindex: boolean } | null {
	if (raw === null) return null;
	try {
		const v = JSON.parse(raw) as { at?: unknown; expiresAt?: unknown; noindex?: unknown } | null;
		if (!v || typeof v.at !== 'number' || typeof v.expiresAt !== 'number') return null;
		return { at: v.at, expiresAt: v.expiresAt, noindex: v.noindex === true };
	} catch {
		return null;
	}
}

type Miss = Extract<CacheRecord, { kind: 'miss' }>;

function missRecord(expiresAt: number, noindex: boolean): Miss {
	return noindex ? { kind: 'miss', expiresAt, noindex: true } : { kind: 'miss', expiresAt };
}

function missAnswer(record: Miss): { miss: true; noindex?: true } {
	return record.noindex ? { miss: true, noindex: true } : { miss: true };
}

export function createPageCache(opts: {
	maxPages: number;
	ttlSeconds: number;
	missSeconds?: number;
	store?: Store;
	now?: () => number;
}): PageCache {
	const now = opts.now ?? Date.now;
	const ttlMs = opts.ttlSeconds * 1000;
	const missSeconds = opts.missSeconds ?? CACHE_DEFAULTS.missSeconds;
	const max = Math.max(1, opts.maxPages);
	const store = opts.store;
	// Map iteration order is insertion order: re-inserting on use keeps it LRU, oldest first.
	const pages = new Map<string, CacheRecord>();
	const misses = new Map<string, Miss>();

	function lru<V>(map: Map<string, V>, route: string, value: V): void {
		map.delete(route);
		map.set(route, value);
		while (map.size > max) map.delete(map.keys().next().value as string);
	}

	function put(route: string, record: CacheRecord): void {
		if (record.kind === 'page' || record.noindex) {
			misses.delete(route);
			lru(pages, route, record);
		} else {
			pages.delete(route);
			lru(misses, route, record);
		}
	}

	function lookup(route: string): CacheRecord | undefined {
		return pages.get(route) ?? misses.get(route);
	}

	function answer(entry: PageEntry) {
		return { entry, stale: now() - entry.fetchedAt > ttlMs };
	}

	async function storeGet(key: string): Promise<string | null> {
		try {
			return await store!.get(key);
		} catch {
			return null;
		}
	}

	async function storeSet(key: string, value: string, ttl: number): Promise<void> {
		try {
			await store!.set(key, value, ttl);
		} catch {
			// A failing store degrades to the in-memory cache.
		}
	}

	return {
		async get(route) {
			const record = lookup(route);
			if (record) {
				if (record.kind === 'page') {
					put(route, record);
					return answer(record.entry);
				}
				if (record.expiresAt > now()) {
					put(route, record);
					return missAnswer(record);
				}
				pages.delete(route);
				misses.delete(route);
			}
			if (!store) return null;

			const [pageRaw, missRaw] = await Promise.all([
				storeGet(PAGE_PREFIX + route),
				storeGet(MISS_PREFIX + route)
			]);
			const entry = parseEntry(pageRaw);
			const miss = parseMiss(missRaw);
			const missLive = miss !== null && miss.expiresAt > now();
			if (missLive && (!entry || miss.at > entry.fetchedAt)) {
				const record = missRecord(miss.expiresAt, miss.noindex);
				put(route, record);
				return missAnswer(record);
			}
			if (entry && entry.route === route) {
				put(route, { kind: 'page', entry });
				return answer(entry);
			}
			return null;
		},

		async set(route, entry) {
			put(route, { kind: 'page', entry });
			if (store) await storeSet(PAGE_PREFIX + route, JSON.stringify(entry), opts.ttlSeconds * 2);
		},

		async setMiss(route) {
			const at = now();
			const expiresAt = at + missSeconds * 1000;
			put(route, { kind: 'miss', expiresAt });
			if (store) await storeSet(MISS_PREFIX + route, JSON.stringify({ at, expiresAt }), missSeconds);
		},

		async setNoindex(route) {
			const at = now();
			const expiresAt = at + ttlMs;
			put(route, { kind: 'miss', expiresAt, noindex: true });
			if (!store) return;
			await Promise.all([
				storeSet(MISS_PREFIX + route, JSON.stringify({ at, expiresAt, noindex: true }), opts.ttlSeconds),
				// The store has no delete: an empty value is no entry, and it is soon gone.
				storeSet(PAGE_PREFIX + route, '', missSeconds)
			]);
		},

		size() {
			return pages.size + misses.size;
		},

		routes() {
			return [...pages.keys(), ...misses.keys()];
		},

		peek(route) {
			return lookup(route);
		}
	};
}
