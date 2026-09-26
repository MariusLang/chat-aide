/**
 * The page cache (spec §3.4 "What is cached"). Pages and misses share one LRU bounded by
 * `limits.maxPages`, so a stream of invented routes cannot grow it. A stale page is kept until
 * evicted; the stale-while-revalidate decision belongs to `readPage`.
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
	/** Every cached route, pages and misses, in LRU order, most recent last. */
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
	const memory = new Map<string, CacheRecord>();

	function put(route: string, record: CacheRecord): void {
		memory.delete(route);
		memory.set(route, record);
		while (memory.size > max) {
			const oldest = memory.keys().next().value as string;
			memory.delete(oldest);
		}
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
			const record = memory.get(route);
			if (record) {
				if (record.kind === 'page') {
					put(route, record);
					return answer(record.entry);
				}
				if (record.expiresAt > now()) {
					put(route, record);
					return { miss: true };
				}
				memory.delete(route);
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
			return memory.size;
		},

		routes() {
			return [...memory.keys()];
		},

		peek(route) {
			return memory.get(route);
		}
	};
}
