import { Redis } from '@upstash/redis';
import type { Store } from '@chat-aide/sveltekit/server';

/**
 * The shared store behind the chat's rate limits, budgets and page cache: Vercel runs many
 * short-lived instances, and each would count on its own with the in-memory default.
 */
export function redisStore(url: string, token: string): Store {
	const redis = new Redis({ url, token, automaticDeserialization: false });
	return {
		async incr(key, by, ttlSeconds) {
			// One transaction, so a counter can never be left without its TTL and lock a visitor out.
			const [, total] = await redis.multi().set(key, 0, { nx: true, ex: ttlSeconds }).incrby(key, by).exec<[unknown, number]>();
			return Number(total);
		},
		get: (key) => redis.get<string>(key),
		async set(key, value, ttlSeconds) {
			await redis.set(key, value, { ex: ttlSeconds });
		}
	};
}
