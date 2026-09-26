import { describe, it, expect } from 'vitest';
import { memoryStore } from '../../../src/lib/server/store';

function clock(start = 1_000_000) {
	let t = start;
	return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('memoryStore', () => {
	it('get of a missing key is null', async () => {
		const s = memoryStore();
		expect(await s.get('nope')).toBeNull();
	});

	it('set/get round-trips and honours the TTL', async () => {
		const c = clock();
		const s = memoryStore({ now: c.now });
		await s.set('k', 'v', 10);
		expect(await s.get('k')).toBe('v');
		c.advance(9_999);
		expect(await s.get('k')).toBe('v');
		c.advance(1);
		expect(await s.get('k')).toBeNull();
	});

	it('set overwrites value and TTL', async () => {
		const c = clock();
		const s = memoryStore({ now: c.now });
		await s.set('k', 'a', 1);
		await s.set('k', 'b', 100);
		c.advance(5_000);
		expect(await s.get('k')).toBe('b');
	});

	it('incr creates with by and returns running totals', async () => {
		const s = memoryStore();
		expect(await s.incr('n', 1, 60)).toBe(1);
		expect(await s.incr('n', 5, 60)).toBe(6);
		expect(await s.get('n')).toBe('6');
	});

	it('incr sets the TTL on first write only', async () => {
		const c = clock();
		const s = memoryStore({ now: c.now });
		await s.incr('n', 1, 10);
		c.advance(8_000);
		await s.incr('n', 1, 10); // must not extend the expiry
		c.advance(2_000);
		expect(await s.get('n')).toBeNull();
		expect(await s.incr('n', 1, 10)).toBe(1);
	});

	it('incr after expiry starts from zero', async () => {
		const c = clock();
		const s = memoryStore({ now: c.now });
		await s.incr('n', 7, 1);
		c.advance(1_000);
		expect(await s.incr('n', 2, 1)).toBe(2);
	});

	it('separate stores do not share state', async () => {
		const a = memoryStore();
		const b = memoryStore();
		await a.set('k', 'v', 60);
		expect(await b.get('k')).toBeNull();
	});
});
