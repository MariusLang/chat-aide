import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	resolveWaitUntil,
	isLikelyServerless,
	runCallback,
	type WaitUntil
} from '../../../src/lib/server/background';

const VERCEL_CONTEXT = Symbol.for('@vercel/request-context');
const g = globalThis as Record<symbol, unknown>;

const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
	delete g[VERCEL_CONTEXT];
});

describe('resolveWaitUntil', () => {
	it('prefers event.platform.context.waitUntil, called with its context bound', async () => {
		const seen: Promise<unknown>[] = [];
		const context = {
			waitUntil(this: unknown, p: Promise<unknown>) {
				if (this !== context) throw new Error('unbound');
				seen.push(p);
			}
		};
		const configured = vi.fn();
		const wu = await resolveWaitUntil({ platform: { context } }, configured);
		const p = Promise.resolve(1);
		wu(p);
		expect(seen).toEqual([p]);
		expect(configured).not.toHaveBeenCalled();
	});

	it('uses config.waitUntil when the platform has none', async () => {
		const configured = vi.fn();
		for (const event of [null, {}, { platform: {} }, { platform: { context: {} } }]) {
			configured.mockClear();
			const wu = await resolveWaitUntil(event, configured);
			const p = Promise.resolve();
			wu(p);
			expect(configured).toHaveBeenCalledWith(p);
		}
	});

	it('uses @vercel/functions waitUntil only when a Vercel request context exists', async () => {
		const vercel = vi.fn();
		const configured = vi.fn();
		g[VERCEL_CONTEXT] = { get: () => ({ waitUntil: vercel }) };
		const wu = await resolveWaitUntil({ platform: {} }, configured);
		const p = Promise.resolve();
		wu(p);
		expect(vercel).toHaveBeenCalledWith(p);
		expect(configured).not.toHaveBeenCalled();
	});

	it('does not pick the Vercel path outside Vercel (its waitUntil would be a silent no-op)', async () => {
		const configured = vi.fn();
		g[VERCEL_CONTEXT] = { get: () => ({}) };
		const wu = await resolveWaitUntil(null, configured);
		wu(Promise.resolve());
		expect(configured).toHaveBeenCalledTimes(1);
	});

	it('falls back to fire-and-forget without throwing, even for a rejecting promise', async () => {
		const unhandled = vi.fn();
		process.on('unhandledRejection', unhandled);
		try {
			const wu = await resolveWaitUntil(null);
			expect(() => wu(Promise.resolve())).not.toThrow();
			expect(() => wu(Promise.reject(new Error('x')))).not.toThrow();
			await tick();
			await tick();
			expect(unhandled).not.toHaveBeenCalled();
		} finally {
			process.off('unhandledRejection', unhandled);
		}
	});

	it('a throwing platform waitUntil never throws to the caller', async () => {
		const wu = await resolveWaitUntil({
			platform: {
				context: {
					waitUntil() {
						throw new Error('boom');
					}
				}
			}
		});
		expect(() => wu(Promise.resolve())).not.toThrow();
	});
});

describe('isLikelyServerless', () => {
	it('reads nothing by itself', () => {
		expect(isLikelyServerless()).toBe(false);
		expect(isLikelyServerless({})).toBe(false);
	});

	it.each([
		['VERCEL', '1'],
		['NETLIFY', 'true'],
		['AWS_LAMBDA_FUNCTION_NAME', 'fn'],
		['CF_PAGES', '1'],
		['K_SERVICE', 'svc'],
		['FUNCTIONS_WORKER_RUNTIME', 'node']
	])('detects %s', (key, value) => {
		expect(isLikelyServerless({ [key]: value })).toBe(true);
	});

	it('ignores empty markers', () => {
		expect(isLikelyServerless({ VERCEL: '', NETLIFY: undefined })).toBe(false);
	});
});

describe('runCallback', () => {
	const collect = () => {
		const promises: Promise<unknown>[] = [];
		const wu: WaitUntil = (p) => {
			promises.push(p);
		};
		return { wu, promises };
	};

	it('never runs fn synchronously and never throws, even if fn throws synchronously', async () => {
		const { wu, promises } = collect();
		const onError = vi.fn();
		const fn = vi.fn(() => {
			throw new Error('sync');
		});
		expect(() => runCallback(wu, fn, { a: 1 }, onError, 's1')).not.toThrow();
		expect(fn).not.toHaveBeenCalled();
		expect(promises).toHaveLength(1);
		await promises[0];
		expect(fn).toHaveBeenCalledWith({ a: 1 });
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0]![0].sessionId).toBe('s1');
	});

	it('hands a rejection to onError with sessionId, error and date', async () => {
		const { wu, promises } = collect();
		const onError = vi.fn();
		const error = new Error('async');
		runCallback(wu, async () => Promise.reject(error), 'x', onError, 'sess');
		await promises[0];
		const arg = onError.mock.calls[0]![0];
		expect(arg.sessionId).toBe('sess');
		expect(arg.error).toBe(error);
		expect(arg.at).toBeInstanceOf(Date);
	});

	it('defaults sessionId to null', async () => {
		const { wu, promises } = collect();
		const onError = vi.fn();
		runCallback(wu, () => Promise.reject(new Error('e')), 0, onError);
		await promises[0];
		expect(onError.mock.calls[0]![0].sessionId).toBeNull();
	});

	it('swallows a throw or rejection from onError (no unhandled rejection)', async () => {
		const unhandled = vi.fn();
		process.on('unhandledRejection', unhandled);
		try {
			const { wu, promises } = collect();
			runCallback(wu, () => { throw new Error('a'); }, 0, () => { throw new Error('b'); });
			runCallback(wu, () => Promise.reject(new Error('c')), 0, () => Promise.reject(new Error('d')));
			runCallback(wu, () => Promise.reject(new Error('e')), 0);
			await expect(Promise.all(promises)).resolves.toBeDefined();
			await tick();
			await tick();
			expect(unhandled).not.toHaveBeenCalled();
		} finally {
			process.off('unhandledRejection', unhandled);
		}
	});

	it('the promise handed to waitUntil resolves only after fn completes', async () => {
		const { wu, promises } = collect();
		let release!: () => void;
		let done = false;
		runCallback(
			wu,
			() =>
				new Promise<void>((r) => {
					release = () => {
						done = true;
						r();
					};
				}),
			0
		);
		let settled = false;
		void promises[0]!.then(() => (settled = true));
		await tick();
		expect(settled).toBe(false);
		release();
		await promises[0];
		expect(done).toBe(true);
		expect(settled).toBe(true);
	});

	it('does nothing when no callback is configured', () => {
		const { wu, promises } = collect();
		runCallback(wu, undefined, 0);
		expect(promises).toHaveLength(0);
	});

	it('survives a waitUntil that throws, and still runs fn', async () => {
		const fn = vi.fn();
		expect(() =>
			runCallback(
				() => {
					throw new Error('wu');
				},
				fn,
				1
			)
		).not.toThrow();
		await tick();
		expect(fn).toHaveBeenCalledWith(1);
	});
});
