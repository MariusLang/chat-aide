import type { ResolvedConfig, Store } from '../shared/types.js';

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
 * The part of an address that identifies one client: an IPv6 address by its /64, since one
 * connection usually gets a whole /64 to pick addresses from; an IPv4-mapped IPv6 address as its
 * IPv4 address; anything else (IPv4, or what is not an address) as given.
 */
export function addressKey(address: string): string {
	let a = address.trim().toLowerCase();
	if (a.startsWith('[') && a.endsWith(']')) a = a.slice(1, -1);
	a = a.split('%')[0]!; // zone index
	if (!a.includes(':')) return address;
	const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(a);
	if (mapped) return mapped[1]!;
	const v4 = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a);
	if (v4) {
		const [b0, b1, b2, b3] = v4.slice(2).map(Number) as [number, number, number, number];
		a = `${v4[1]}${((b0 << 8) | b1).toString(16)}:${((b2 << 8) | b3).toString(16)}`;
	}
	const halves = a.split('::');
	if (halves.length > 2) return address;
	const head = halves[0] ? halves[0].split(':') : [];
	const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
	const fill = 8 - head.length - tail.length;
	if (halves.length === 2 ? fill < 1 : fill !== 0) return address;
	const groups = [...head, ...Array<string>(halves.length === 2 ? fill : 0).fill('0'), ...tail];
	if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return address;
	return `${groups
		.slice(0, 4)
		.map((g) => parseInt(g, 16).toString(16))
		.join(':')}::/64`;
}

/**
 * The visitor's rate-limit identity: hex HMAC-SHA256 of the client address (by `addressKey`) or
 * of `clientKey(event)` when given, under `salt`. The address itself is never stored.
 */
export async function clientId<E extends { getClientAddress(): string }>(
	event: E,
	opts: { salt: string; clientKey?: (e: E) => string }
): Promise<string> {
	const raw = opts.clientKey ? opts.clientKey(event) : addressKey(event.getClientAddress());
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
	/**
	 * Counts a turn's estimated tokens against the budgets before it starts, so turns started
	 * together cannot all pass one check. Refused when a budget was already used up without this
	 * turn; the estimate is then taken back.
	 */
	reserve(id: string, tokens: number): Promise<Reservation | 'visitor' | 'site'>;
}

export interface Reservation {
	/** Replaces the estimate with the turn's real tokens, on the day it was reserved. */
	settle(tokens: number): Promise<void>;
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
			if (!(tokens > 0)) return;
			await add(id, utcDay(now()), tokens);
		},

		async reserve(id, tokens) {
			const day = utcDay(now());
			const settle = async (spent: number) => {
				await add(id, day, (spent > 0 ? spent : 0) - tokens);
			};
			if (budget === false || !(tokens > 0)) return { settle };
			const [visitor, site] = await add(id, day, tokens);
			const over =
				visitor !== undefined && budget.tokensPerDay !== false && visitor - tokens >= budget.tokensPerDay
					? 'visitor'
					: site !== undefined && budget.siteTokensPerDay !== false && site - tokens >= budget.siteTokensPerDay
						? 'site'
						: null;
			if (over === null) return { settle };
			await add(id, day, -tokens);
			return over;
		}
	};

	/** Adds to the day's counters that are on; resolves to their new values (visitor, site). */
	async function add(id: string, day: string, tokens: number): Promise<[number?, number?]> {
		if (budget === false || tokens === 0) return [];
		return Promise.all([
			budget.tokensPerDay !== false ? store.incr(`aide:tok:${id}:${day}`, tokens, DAY_TTL) : undefined,
			budget.siteTokensPerDay !== false ? store.incr(`aide:tok:site:${day}`, tokens, DAY_TTL) : undefined
		]);
	}
}
