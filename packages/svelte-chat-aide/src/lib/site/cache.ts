/**
 * The page cache (spec §3.4 "What is cached"). Pages and misses each have their own LRU bounded
 * by `limits.maxPages` (at most 2 × maxPages records), so a stream of invented routes can neither
 * grow the cache nor evict a crawled page. A stale page is kept until evicted; the
 * stale-while-revalidate decision belongs to `readPage`.
 */
import { CACHE_DEFAULTS } from '../shared/limits';
import type { PageEntry, Store } from '../shared/types';

export type CacheRecord = { kind: 'page'; entry: PageEntry } | { kind: 'miss'; expiresAt: number };

export interface PageCache {
	get(route: string): Promise<{ entry: PageEntry; stale: boolean } | { miss: true } | null>;
	set(route: string, entry: PageEntry): Promise<void>;
	/** Remembered for `missSeconds` (60 s), without a body. */
	setMiss(route: string): Promise<void>;
	size(): number;
	/** Every cached route: pages, then misses, each in LRU order, most recent last. */
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

function parseMiss(raw: string | null): { at: number; expiresAt: number } | null {
	if (raw === null) return null;
	try {
		const v = JSON.parse(raw) as { at?: unknown; expiresAt?: unknown } | null;
		if (!v || typeof v.at !== 'number' || typeof v.expiresAt !== 'number') return null;
		return { at: v.at, expiresAt: v.expiresAt };
	} catch {
		return null;
	}
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
	const pages = new Map<string, Extract<CacheRecord, { kind: 'page' }>>();
	const misses = new Map<string, Extract<CacheRecord, { kind: 'miss' }>>();

	function lru<V>(map: Map<string, V>, route: string, value: V): void {
		map.delete(route);
		map.set(route, value);
		while (map.size > max) map.delete(map.keys().next().value as string);
	}

	function put(route: string, record: CacheRecord): void {
		if (record.kind === 'page') {
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
					return { miss: true };
				}
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
				put(route, { kind: 'miss', expiresAt: miss.expiresAt });
				return { miss: true };
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
