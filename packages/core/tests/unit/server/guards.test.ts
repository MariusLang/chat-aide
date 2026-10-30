import { describe, it, expect } from 'vitest';
import { memoryStore } from '../../../src/server/store';
import { checkOrigin, clientId, createGuards } from '../../../src/server/guards';
import type { ResolvedConfig } from '../../../src/shared/types';

type Cfg = Pick<ResolvedConfig, 'rateLimit' | 'budget'>;
const defaults: Cfg = {
	rateLimit: { requests: 20, windowSeconds: 600, warmups: 60 },
	budget: { tokensPerDay: 200_000, siteTokensPerDay: 5_000_000 }
};

function clock(start = Date.UTC(2026, 8, 26, 12, 0, 0)) {
	let t = start;
	return { now: () => t, advance: (ms: number) => (t += ms) };
}

function setup(cfg: Cfg = defaults) {
	const c = clock();
	const store = memoryStore({ now: c.now });
	return { c, store, g: createGuards(cfg, store, c.now) };
}

describe('rate limit', () => {
	it('allows 20 chats, refuses the 21st, allows again after the window', async () => {
		const { c, g } = setup();
		for (let i = 0; i < 20; i++) expect(await g.rate('chat', 'a')).toBe(true);
		expect(await g.rate('chat', 'a')).toBe(false);
		expect(await g.rate('chat', 'b')).toBe(true);
		c.advance(600_000);
		expect(await g.rate('chat', 'a')).toBe(true);
	});

	it('warm-up has its own bucket of 60', async () => {
		const { g } = setup();
		for (let i = 0; i < 20; i++) await g.rate('chat', 'a');
		expect(await g.rate('chat', 'a')).toBe(false);
		for (let i = 0; i < 60; i++) expect(await g.rate('warmup', 'a')).toBe(true);
		expect(await g.rate('warmup', 'a')).toBe(false);
	});

	it('uses the key format aide:rl:<kind>:<id>:<window>', async () => {
		const { c, store, g } = setup();
		await g.rate('chat', 'abc');
		const w = Math.floor(c.now() / 1000 / 600);
		expect(await store.get(`aide:rl:chat:abc:${w}`)).toBe('1');
	});

	it('honours custom values', async () => {
		const { c, g } = setup({ ...defaults, rateLimit: { requests: 2, windowSeconds: 10, warmups: 1 } });
		expect(await g.rate('chat', 'a')).toBe(true);
		expect(await g.rate('chat', 'a')).toBe(true);
		expect(await g.rate('chat', 'a')).toBe(false);
		expect(await g.rate('warmup', 'a')).toBe(true);
		expect(await g.rate('warmup', 'a')).toBe(false);
		c.advance(10_000);
		expect(await g.rate('chat', 'a')).toBe(true);
	});

	it('rateLimit: false always allows', async () => {
		const { g } = setup({ ...defaults, rateLimit: false });
		for (let i = 0; i < 500; i++) expect(await g.rate('chat', 'a')).toBe(true);
	});
});

describe('budgets', () => {
	it('visitor over tokensPerDay gets "visitor"', async () => {
		const { g } = setup();
		expect(await g.budgetOk('a')).toBe('ok');
		await g.charge('a', 199_999);
		expect(await g.budgetOk('a')).toBe('ok');
		await g.charge('a', 1);
		expect(await g.budgetOk('a')).toBe('visitor');
		expect(await g.budgetOk('b')).toBe('ok');
	});

	it('site-wide budget refuses a new address once spent (acceptance #23)', async () => {
		const { g } = setup();
		for (let i = 0; i < 50; i++) {
			expect(await g.budgetOk(`id${i}`)).toBe('ok');
			await g.charge(`id${i}`, 100_000);
		}
		expect(await g.budgetOk('id50')).toBe('site');
	});

	it('budgetOk only reads', async () => {
		const { store, g } = setup();
		for (let i = 0; i < 5; i++) await g.budgetOk('a');
		expect(await store.get('aide:tok:a:2026-09-26')).toBeNull();
		expect(await store.get('aide:tok:site:2026-09-26')).toBeNull();
	});

	it('uses UTC day keys and resets on the next day', async () => {
		const { c, store, g } = setup();
		await g.charge('a', 300_000);
		expect(await store.get('aide:tok:a:2026-09-26')).toBe('300000');
		expect(await store.get('aide:tok:site:2026-09-26')).toBe('300000');
		expect(await g.budgetOk('a')).toBe('visitor');
		c.advance(12 * 3600_000); // 2026-09-27T00:00Z
		expect(await g.budgetOk('a')).toBe('ok');
	});

	it('honours custom values', async () => {
		const { g } = setup({ ...defaults, budget: { tokensPerDay: 10, siteTokensPerDay: 25 } });
		await g.charge('a', 10);
		expect(await g.budgetOk('a')).toBe('visitor');
		await g.charge('b', 15);
		expect(await g.budgetOk('c')).toBe('site');
	});

	it('budget: false always ok and charges nothing', async () => {
		const { store, g } = setup({ ...defaults, budget: false });
		await g.charge('a', 1e12);
		expect(await g.budgetOk('a')).toBe('ok');
		expect(await store.get('aide:tok:site:2026-09-26')).toBeNull();
	});

	it('each budget can be disabled alone', async () => {
		const v = setup({ ...defaults, budget: { tokensPerDay: false, siteTokensPerDay: 100 } });
		await v.g.charge('a', 99);
		expect(await v.g.budgetOk('a')).toBe('ok');
		await v.g.charge('a', 1);
		expect(await v.g.budgetOk('a')).toBe('site');

		const s = setup({ ...defaults, budget: { tokensPerDay: 100, siteTokensPerDay: false } });
		for (let i = 0; i < 100; i++) await s.g.charge(`id${i}`, 99);
		expect(await s.g.budgetOk('new')).toBe('ok');
		await s.g.charge('a', 100);
		expect(await s.g.budgetOk('a')).toBe('visitor');
	});
});

describe('checkOrigin', () => {
	const req = (headers: Record<string, string>, url = 'https://example.com/api/aide') =>
		new Request(url, { method: 'POST', headers });
	const origin = 'https://example.com';

	it('accepts sec-fetch-site: same-origin', () => {
		expect(checkOrigin(req({ 'sec-fetch-site': 'same-origin' }), { origin, allowedOrigins: [] })).toBe(true);
	});

	it('refuses same-site alone', () => {
		expect(
			checkOrigin(req({ 'sec-fetch-site': 'same-site', origin: 'https://blog.example.com' }), {
				origin,
				allowedOrigins: []
			})
		).toBe(false);
	});

	it('accepts a cross-site request whose Origin matches the configured origin', () => {
		expect(
			checkOrigin(req({ 'sec-fetch-site': 'cross-site', origin }), { origin, allowedOrigins: [] })
		).toBe(true);
	});

	it('refuses a foreign Origin even with a forged Host / request URL', () => {
		expect(
			checkOrigin(req({ origin: 'https://evil.test', host: 'evil.test' }, 'https://evil.test/api/aide'), {
				origin,
				allowedOrigins: []
			})
		).toBe(false);
	});

	it('accepts an Origin in allowedOrigins', () => {
		expect(
			checkOrigin(req({ 'sec-fetch-site': 'cross-site', origin: 'https://app.example.org' }), {
				origin,
				allowedOrigins: ['https://app.example.org']
			})
		).toBe(true);
	});

	it('with nothing configured, an Origin header alone is refused', () => {
		expect(
			checkOrigin(req({ origin: 'https://example.com' }), { allowedOrigins: [] })
		).toBe(false);
		expect(checkOrigin(req({ 'sec-fetch-site': 'same-origin' }), { allowedOrigins: [] })).toBe(true);
	});

	it('refuses a request with no headers at all', () => {
		expect(checkOrigin(req({}), { origin, allowedOrigins: [] })).toBe(false);
	});

	it('refuses Origin: null', () => {
		expect(checkOrigin(req({ origin: 'null' }), { origin, allowedOrigins: ['null'] })).toBe(false);
	});
});

describe('clientId', () => {
	const ev = (addr: string) => ({ getClientAddress: () => addr });

	it('is a stable hex HMAC for the same address and salt', async () => {
		const a = await clientId(ev('203.0.113.7'), { salt: 's1' });
		expect(a).toMatch(/^[0-9a-f]{64}$/);
		expect(await clientId(ev('203.0.113.7'), { salt: 's1' })).toBe(a);
		expect(await clientId(ev('203.0.113.8'), { salt: 's1' })).not.toBe(a);
	});

	it('differs with a different salt', async () => {
		expect(await clientId(ev('203.0.113.7'), { salt: 's1' })).not.toBe(
			await clientId(ev('203.0.113.7'), { salt: 's2' })
		);
	});

	it('never contains the address', async () => {
		const id = await clientId(ev('203.0.113.7'), { salt: 's1' });
		expect(id).not.toContain('203.0.113.7');
		expect(id).not.toContain('203');
	});

	it('uses clientKey when given, not the address', async () => {
		let called = false;
		const e = {
			getClientAddress: () => {
				called = true;
				return 'proxy';
			},
			request: new Request('https://x.test', { headers: { 'x-real-ip': '198.51.100.1' } })
		};
		const key = (x: typeof e) => x.request.headers.get('x-real-ip') ?? '';
		const viaKey = await clientId(e, { salt: 's', clientKey: key });
		expect(called).toBe(false);
		expect(viaKey).toBe(await clientId(ev('198.51.100.1'), { salt: 's' }));
	});
});
