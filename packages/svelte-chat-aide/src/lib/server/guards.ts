import type { ResolvedConfig, Store } from '../shared/types';

/**
 * Same-origin check (spec §3.6). `Sec-Fetch-Site: same-origin` passes; otherwise the `Origin`
 * header must equal the configured origin or be listed in `allowedOrigins`. `same-site` alone
 * is not enough. Never compares against the request URL or `Host`.
 */
export function checkOrigin(
	request: Request,
	opts: { origin?: string; allowedOrigins: string[] }
): boolean {
	if (request.headers.get('sec-fetch-site') === 'same-origin') return true;
	const o = request.headers.get('origin');
	if (!o || o === 'null') return false;
	if (opts.origin !== undefined && o === opts.origin) return true;
	return opts.allowedOrigins.includes(o);
}

const encoder = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

function hmacKey(salt: string): Promise<CryptoKey> {
	let k = keys.get(salt);
	if (!k) {
		k = crypto.subtle.importKey('raw', encoder.encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, [
			'sign'
		]);
		keys.set(salt, k);
	}
	return k;
}

/**
 * The visitor's rate-limit identity: hex HMAC-SHA256 of the client address (or of
 * `clientKey(event)` when given) under `salt`. The address itself is never stored.
 */
export async function clientId<E extends { getClientAddress(): string }>(
	event: E,
	opts: { salt: string; clientKey?: (e: E) => string }
): Promise<string> {
	const raw = opts.clientKey ? opts.clientKey(event) : event.getClientAddress();
	const sig = await crypto.subtle.sign('HMAC', await hmacKey(opts.salt), encoder.encode(raw));
	return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface Guards {
	/** Counts one request in the visitor's bucket; `true` = allowed. */
	rate(kind: 'chat' | 'warmup', id: string): Promise<boolean>;
	/** Reads the day's counters without writing. */
	budgetOk(id: string): Promise<'ok' | 'visitor' | 'site'>;
	/** Adds a finished turn's tokens to the visitor and site day counters. */
	charge(id: string, tokens: number): Promise<void>;
}

/** Day counters outlive their UTC day by a minute, so a late charge still lands. */
const DAY_TTL = 86_400 + 60;

function utcDay(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

/** Rate limit and token budgets over a `Store` (spec §3.5, §3.6). */
export function createGuards(
	cfg: Pick<ResolvedConfig, 'rateLimit' | 'budget'>,
	store: Store,
	now: () => number = Date.now
): Guards {
	const { rateLimit, budget } = cfg;

	async function used(key: string): Promise<number> {
		return Number(await store.get(key)) || 0;
	}

	return {
		async rate(kind, id) {
			if (rateLimit === false) return true;
			const { windowSeconds } = rateLimit;
			const limit = kind === 'chat' ? rateLimit.requests : rateLimit.warmups;
			const win = Math.floor(now() / 1000 / windowSeconds);
			const n = await store.incr(`aide:rl:${kind}:${id}:${win}`, 1, windowSeconds);
			return n <= limit;
		},

		async budgetOk(id) {
			if (budget === false) return 'ok';
			const day = utcDay(now());
			const { tokensPerDay, siteTokensPerDay } = budget;
			if (tokensPerDay !== false && (await used(`aide:tok:${id}:${day}`)) >= tokensPerDay)
				return 'visitor';
			if (siteTokensPerDay !== false && (await used(`aide:tok:site:${day}`)) >= siteTokensPerDay)
				return 'site';
			return 'ok';
		},

		async charge(id, tokens) {
			if (budget === false || !(tokens > 0)) return;
			const day = utcDay(now());
			const writes: Promise<number>[] = [];
			if (budget.tokensPerDay !== false) writes.push(store.incr(`aide:tok:${id}:${day}`, tokens, DAY_TTL));
			if (budget.siteTokensPerDay !== false)
				writes.push(store.incr(`aide:tok:site:${day}`, tokens, DAY_TTL));
			await Promise.all(writes);
		}
	};
}
