import { describe, it, expect } from 'vitest';
import { createPageCache } from '../../../src/lib/site/cache';
import type { PageEntry, Store } from '../../../src/lib/shared/types';

function entry(route: string, fetchedAt: number, text = `text of ${route}`): PageEntry {
	return { route, title: route, headings: [], text, hash: 'h', thin: false, source: 'render', fetchedAt };
}

function clock(start = 1_000_000) {
	let t = start;
	return { now: () => t, advance: (ms: number) => (t += ms) };
}

/** A Map-backed Store that honours TTLs on the same fake clock and records writes. */
function fakeStore(now: () => number) {
	const data = new Map<string, { value: string; expires: number }>();
	const writes: { key: string; ttl: number }[] = [];
	const store: Store = {
		async incr(key, by, ttl) {
			const cur = Number((await store.get(key)) ?? 0) + by;
			await store.set(key, String(cur), ttl);
			return cur;
		},
		async get(key) {
			const v = data.get(key);
			if (!v || v.expires <= now()) return null;
			return v.value;
		},
		async set(key, value, ttl) {
			writes.push({ key, ttl });
			data.set(key, { value, expires: now() + ttl * 1000 });
		}
	};
	return { store, data, writes };
}

describe('page cache: memory', () => {
	it('returns null for an unknown route', async () => {
		const cache = createPageCache({ maxPages: 5, ttlSeconds: 60 });
		expect(await cache.get('/x')).toBeNull();
	});

	it('stores and returns a fresh entry', async () => {
		const c = clock();
		const cache = createPageCache({ maxPages: 5, ttlSeconds: 60, now: c.now });
		const e = entry('/a', c.now());
		await cache.set('/a', e);
		expect(await cache.get('/a')).toEqual({ entry: e, stale: false });
	});

	it('flags an entry older than the TTL as stale and keeps it', async () => {
		const c = clock();
		const cache = createPageCache({ maxPages: 5, ttlSeconds: 60, now: c.now });
		await cache.set('/a', entry('/a', c.now()));
		c.advance(60_000);
		expect(await cache.get('/a')).toMatchObject({ stale: false });
		c.advance(1);
		expect(await cache.get('/a')).toMatchObject({ stale: true });
		c.advance(10 * 3_600_000);
		expect(await cache.get('/a')).toMatchObject({ stale: true, entry: { route: '/a' } });
	});

	it('remembers a miss for 60 s by default, then forgets it', async () => {
		const c = clock();
		const cache = createPageCache({ maxPages: 5, ttlSeconds: 3600, now: c.now });
		await cache.setMiss('/gone');
		expect(await cache.get('/gone')).toEqual({ miss: true });
		c.advance(59_999);
		expect(await cache.get('/gone')).toEqual({ miss: true });
		c.advance(1);
		expect(await cache.get('/gone')).toBeNull();
		expect(cache.size()).toBe(0);
	});

	it('honours missSeconds', async () => {
		const c = clock();
		const cache = createPageCache({ maxPages: 5, ttlSeconds: 3600, missSeconds: 5, now: c.now });
		await cache.setMiss('/gone');
		c.advance(5_000);
		expect(await cache.get('/gone')).toBeNull();
	});

	it('a page replaces a miss and a miss replaces a page', async () => {
		const c = clock();
		const cache = createPageCache({ maxPages: 5, ttlSeconds: 3600, now: c.now });
		await cache.setMiss('/a');
		await cache.set('/a', entry('/a', c.now()));
		expect(await cache.get('/a')).toMatchObject({ entry: { route: '/a' } });
		await cache.setMiss('/a');
		expect(await cache.get('/a')).toEqual({ miss: true });
		expect(cache.size()).toBe(1);
	});

	it('evicts the least recently used at maxPages; get refreshes recency', async () => {
		const c = clock();
		const cache = createPageCache({ maxPages: 3, ttlSeconds: 3600, now: c.now });
		await cache.set('/a', entry('/a', c.now()));
		await cache.set('/b', entry('/b', c.now()));
		await cache.set('/c', entry('/c', c.now()));
		await cache.get('/a');
		expect(cache.routes()).toEqual(['/b', '/c', '/a']);
		await cache.set('/d', entry('/d', c.now()));
		expect(cache.size()).toBe(3);
		expect(cache.routes()).toEqual(['/c', '/a', '/d']);
		expect(await cache.get('/b')).toBeNull();
	});

	it('counts entries and misses together', async () => {
		const c = clock();
		const cache = createPageCache({ maxPages: 2, ttlSeconds: 3600, now: c.now });
		await cache.set('/a', entry('/a', c.now()));
		await cache.setMiss('/x');
		await cache.setMiss('/y');
		expect(cache.routes()).toEqual(['/x', '/y']);
		expect(cache.size()).toBe(2);
	});

	it('10 000 invented misses leave size <= maxPages (acceptance #27)', async () => {
		const c = clock();
		const cache = createPageCache({ maxPages: 200, ttlSeconds: 3600, now: c.now });
		for (let i = 0; i < 10_000; i++) await cache.setMiss(`/invented-${i}`);
		expect(cache.size()).toBeLessThanOrEqual(200);
		expect(cache.routes()).toHaveLength(cache.size());
	});

	it('peek returns the raw record without touching recency', async () => {
		const c = clock();
		const cache = createPageCache({ maxPages: 5, ttlSeconds: 3600, now: c.now });
		await cache.set('/a', entry('/a', c.now()));
		await cache.setMiss('/b');
		expect(cache.peek('/a')).toEqual({ kind: 'page', entry: entry('/a', c.now()) });
		expect(cache.peek('/b')).toEqual({ kind: 'miss', expiresAt: c.now() + 60_000 });
		expect(cache.peek('/nope')).toBeUndefined();
		expect(cache.routes()).toEqual(['/a', '/b']);
	});
});

describe('page cache: with a Store', () => {
	it('writes entries under aide:page:<route> with 2x TTL and misses under aide:miss:<route>', async () => {
		const c = clock();
		const s = fakeStore(c.now);
		const cache = createPageCache({ maxPages: 5, ttlSeconds: 100, store: s.store, now: c.now });
		await cache.set('/a', entry('/a', c.now()));
		await cache.setMiss('/b');
		expect(s.writes).toEqual([
			{ key: 'aide:page:/a', ttl: 200 },
			{ key: 'aide:miss:/b', ttl: 60 }
		]);
		expect(JSON.parse(s.data.get('aide:page:/a')!.value)).toEqual(entry('/a', c.now()));
	});

	it('round-trips through the store into a fresh process', async () => {
		const c = clock();
		const s = fakeStore(c.now);
		const one = createPageCache({ maxPages: 5, ttlSeconds: 100, store: s.store, now: c.now });
		await one.set('/a', entry('/a', c.now()));
		await one.setMiss('/b');

		const two = createPageCache({ maxPages: 5, ttlSeconds: 100, store: s.store, now: c.now });
		expect(await two.get('/a')).toEqual({ entry: entry('/a', c.now()), stale: false });
		expect(await two.get('/b')).toEqual({ miss: true });
		expect(await two.get('/c')).toBeNull();
		// Store hits are pulled into memory.
		expect(two.routes()).toEqual(['/a', '/b']);
	});

	it('marks a store entry stale by its fetchedAt', async () => {
		const c = clock();
		const s = fakeStore(c.now);
		const one = createPageCache({ maxPages: 5, ttlSeconds: 100, store: s.store, now: c.now });
		await one.set('/a', entry('/a', c.now()));
		c.advance(150_000);
		const two = createPageCache({ maxPages: 5, ttlSeconds: 100, store: s.store, now: c.now });
		expect(await two.get('/a')).toMatchObject({ stale: true });
	});

	it('a miss newer than the stored page wins in another process', async () => {
		const c = clock();
		const s = fakeStore(c.now);
		const one = createPageCache({ maxPages: 5, ttlSeconds: 100, store: s.store, now: c.now });
		await one.set('/a', entry('/a', c.now()));
		c.advance(1_000);
		await one.setMiss('/a');
		const two = createPageCache({ maxPages: 5, ttlSeconds: 100, store: s.store, now: c.now });
		expect(await two.get('/a')).toEqual({ miss: true });
	});

	it('a page newer than the stored miss wins in another process', async () => {
		const c = clock();
		const s = fakeStore(c.now);
		const one = createPageCache({ maxPages: 5, ttlSeconds: 100, store: s.store, now: c.now });
		await one.setMiss('/a');
		c.advance(1_000);
		await one.set('/a', entry('/a', c.now()));
		const two = createPageCache({ maxPages: 5, ttlSeconds: 100, store: s.store, now: c.now });
		expect(await two.get('/a')).toMatchObject({ entry: { route: '/a' } });
	});

	it('ignores malformed store values', async () => {
		const c = clock();
		const s = fakeStore(c.now);
		await s.store.set('aide:page:/a', '{not json', 100);
		await s.store.set('aide:page:/b', JSON.stringify({ route: '/b' }), 100);
		const cache = createPageCache({ maxPages: 5, ttlSeconds: 100, store: s.store, now: c.now });
		expect(await cache.get('/a')).toBeNull();
		expect(await cache.get('/b')).toBeNull();
	});

	it('memory wins over the store', async () => {
		const c = clock();
		const s = fakeStore(c.now);
		const cache = createPageCache({ maxPages: 5, ttlSeconds: 100, store: s.store, now: c.now });
		await cache.set('/a', entry('/a', c.now(), 'memory'));
		await s.store.set('aide:page:/a', JSON.stringify(entry('/a', c.now(), 'store')), 100);
		expect(await cache.get('/a')).toMatchObject({ entry: { text: 'memory' } });
	});

	it('a failing store degrades to memory only', async () => {
		const c = clock();
		const broken: Store = {
			incr: async () => {
				throw new Error('down');
			},
			get: async () => {
				throw new Error('down');
			},
			set: async () => {
				throw new Error('down');
			}
		};
		const cache = createPageCache({ maxPages: 5, ttlSeconds: 100, store: broken, now: c.now });
		await cache.set('/a', entry('/a', c.now()));
		await cache.setMiss('/b');
		expect(await cache.get('/a')).toMatchObject({ stale: false });
		expect(await cache.get('/b')).toEqual({ miss: true });
		expect(await cache.get('/c')).toBeNull();
	});
});
