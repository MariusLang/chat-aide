import type { Store } from '../shared/types';

interface Entry {
	value: string;
	expires: number;
}

/** Writes between sweeps of expired entries, so abandoned keys do not pile up. */
const SWEEP_EVERY = 1_000;

/**
 * The default in-process `Store` (spec §3.5). Correct only for one long-lived process: on
 * serverless or with several instances each instance counts and caches on its own.
 * `incr` sets the TTL when it creates a key and never extends it, so a counter's window is
 * fixed from its first write.
 */
export function memoryStore(opts: { now?: () => number } = {}): Store {
	const now = opts.now ?? Date.now;
	const map = new Map<string, Entry>();
	let writes = 0;

	function live(key: string): Entry | undefined {
		const e = map.get(key);
		if (!e) return undefined;
		if (e.expires <= now()) {
			map.delete(key);
			return undefined;
		}
		return e;
	}

	function sweep() {
		if (++writes % SWEEP_EVERY !== 0) return;
		const t = now();
		for (const [k, e] of map) if (e.expires <= t) map.delete(k);
	}

	return {
		async incr(key, by, ttlSeconds) {
			sweep();
			const e = live(key);
			if (!e) {
				map.set(key, { value: String(by), expires: now() + ttlSeconds * 1000 });
				return by;
			}
			const n = (Number(e.value) || 0) + by;
			e.value = String(n);
			return n;
		},
		async get(key) {
			return live(key)?.value ?? null;
		},
		async set(key, value, ttlSeconds) {
			sweep();
			map.set(key, { value, expires: now() + ttlSeconds * 1000 });
		}
	};
}
