import { describe, it, expect } from 'vitest';
import { LIMIT_DEFAULTS } from '../../../src/shared/limits';
import { resolveConfig, AideConfigError, createBodySchema } from '../../../src/shared/schemas';
import { DEFAULT_STRINGS, REFUSAL_MESSAGES } from '../../../src/shared/strings';
import type { Store } from '../../../src/shared/types';

const provider = { name: 'anthropic', model: 'm', apiKey: 'k' };

function failure(input: unknown): AideConfigError {
	try {
		resolveConfig(input);
	} catch (e) {
		expect(e).toBeInstanceOf(AideConfigError);
		return e as AideConfigError;
	}
	throw new Error('expected resolveConfig to throw');
}

const store: Store = {
	incr: async () => 1,
	get: async () => null,
	set: async () => {}
};

describe('resolveConfig', () => {
	// 1
	it('fills every default', () => {
		const c = resolveConfig({ provider });
		expect(c.provider).toEqual(provider);
		expect(c.endpoint).toBe('/api/chat');
		expect(c.pageContext).toBe('auto');
		expect(c.caching).toBe(true);
		expect(c.llms).toEqual({ read: true, preferMarkdown: true, serve: true, serveSource: false });
		expect(c.cache.ttlSeconds).toBe(3600);
		expect(c.cache.missSeconds).toBe(60);
		expect(c.rateLimit).toEqual({ requests: 20, windowSeconds: 600, warmups: 60 });
		expect(c.budget).toEqual({ tokensPerDay: 200_000, siteTokensPerDay: 5_000_000 });
		expect(c.limits).toEqual(LIMIT_DEFAULTS);
		expect(c.pages).toEqual({ include: [], exclude: [] });
		expect(c.allowedOrigins).toEqual([]);
		expect(c.facts).toEqual([]);
		expect(c.origin).toBeUndefined();
		expect(c.store).toBeUndefined();
	});

	it('keeps a partial rateLimit / budget and fills the rest', () => {
		const c = resolveConfig({ provider, rateLimit: { requests: 5 }, budget: { siteTokensPerDay: 10 } });
		expect(c.rateLimit).toEqual({ requests: 5, windowSeconds: 600, warmups: 60 });
		expect(c.budget).toEqual({ tokensPerDay: 200_000, siteTokensPerDay: 10 });
	});

	// 4
	it('accepts false for rateLimit, budget and one budget', () => {
		expect(resolveConfig({ provider, rateLimit: false }).rateLimit).toBe(false);
		expect(resolveConfig({ provider, budget: false }).budget).toBe(false);
		expect(resolveConfig({ provider, budget: { tokensPerDay: false } }).budget).toEqual({
			tokensPerDay: false,
			siteTokensPerDay: 5_000_000
		});
	});

	// 5
	it('refuses the gateway provider with a reason', () => {
		const e = failure({ provider: { name: 'gateway', model: 'm' } });
		expect(e.path).toBe('provider.name');
		expect(e.message).toContain('Vercel AI Gateway is not supported');
		expect(e.message).toMatch(/routes? (every )?requests? through Vercel/i);
	});

	it('refuses a gateway model handed in as custom', () => {
		for (const id of ['gateway', 'Gateway.realtime']) {
			const instance = { specificationVersion: 'v4', provider: id, modelId: 'anthropic/claude' };
			const e = failure({ provider: { name: 'custom', model: 'm', instance } });
			expect(e.path).toBe('provider.instance');
			expect(e.message).toContain('Vercel AI Gateway is not supported');
		}
		const ok = { specificationVersion: 'v4', provider: 'anthropic.messages', modelId: 'claude' };
		expect(resolveConfig({ provider: { name: 'custom', model: 'm', instance: ok } }).provider.instance).toBe(ok);
	});

	// 6
	it('requires salt with store and store with salt', () => {
		expect(failure({ provider, store }).path).toBe('salt');
		expect(failure({ provider, salt: 's' }).path).toBe('store');
		const c = resolveConfig({ provider, store, salt: 's' });
		expect(c.store).toBe(store);
		expect(c.salt).toBe('s');
	});

	// 7
	it('requires provider.model and refuses unknown keys', () => {
		expect(failure({ provider: { name: 'anthropic' } }).path).toBe('provider.model');
		const e = failure({ provider, endpiont: '/x' });
		expect(e.message).toContain('endpiont');
		expect(failure({ provider, llms: { red: true } }).path).toBe('llms');
	});

	// 8
	it('normalises origin and refuses one with a path', () => {
		expect(resolveConfig({ provider, origin: 'https://x.dev/' }).origin).toBe('https://x.dev');
		expect(resolveConfig({ provider, origin: 'https://x.dev' }).origin).toBe('https://x.dev');
		expect(failure({ provider, origin: 'https://x.dev/a' }).path).toBe('origin');
		expect(failure({ provider, origin: 'x.dev' }).path).toBe('origin');
		expect(failure({ provider, origin: 'https://x.dev/?q=1' }).path).toBe('origin');
		expect(resolveConfig({ provider, allowedOrigins: ['https://a.dev/'] }).allowedOrigins).toEqual([
			'https://a.dev'
		]);
	});

	it('normalises facts to an array and passes functions through', () => {
		const authorize = () => true;
		const c = resolveConfig({ provider, facts: 'one', authorize });
		expect(c.facts).toEqual(['one']);
		expect(c.authorize).toBe(authorize);
		expect(failure({ provider, authorize: 'yes' }).path).toBe('authorize');
	});
});

describe('createBodySchema', () => {
	const limits = { ...LIMIT_DEFAULTS, messages: 3, messageChars: 10, pageChars: 20 };
	const schema = createBodySchema(limits);
	const msg = (text: string, role = 'user') => ({ role, parts: [{ type: 'text', text }] });
	const body = (over: Record<string, unknown> = {}) => ({
		id: 'c1',
		messages: [msg('hi')],
		aide: { route: '/privacy', sessionId: 's1', dom: null },
		...over
	});
	const failPath = (input: unknown) => {
		const r = schema.safeParse(input);
		expect(r.success).toBe(false);
		return r.error!.issues[0]!.path.join('.');
	};

	it('accepts a valid body', () => {
		const r = schema.safeParse(body());
		expect(r.success).toBe(true);
		expect(r.data!.aide).toEqual({ route: '/privacy', sessionId: 's1', dom: null });
	});

	// 9
	it('rejects too many messages', () => {
		expect(failPath(body({ messages: [msg('a'), msg('b'), msg('c'), msg('d')] }))).toBe('messages');
	});
	it('rejects a text part longer than messageChars', () => {
		expect(failPath(body({ messages: [msg('x'.repeat(11))] }))).toBe('messages.0.parts');
	});
	it('rejects a user message whose parts together exceed messageChars', () => {
		const parts = Array.from({ length: 5 }, () => ({ type: 'text', text: 'x'.repeat(10) }));
		expect(failPath(body({ messages: [{ role: 'user', parts }] }))).toBe('messages.0.parts');
	});
	it('rejects a user message with too many parts', () => {
		const parts = Array.from({ length: 21 }, () => ({ type: 'text', text: '' }));
		expect(failPath(body({ messages: [{ role: 'user', parts }] }))).toBe('messages.0.parts');
	});
	it('accepts a long assistant message, up to 8x messageChars', () => {
		const long = { role: 'assistant', parts: [{ type: 'text', text: 'y'.repeat(80) }] };
		expect(schema.safeParse(body({ messages: [msg('q'), long, msg('q')] })).success).toBe(true);
		const tooLong = { role: 'assistant', parts: [{ type: 'text', text: 'y'.repeat(81) }] };
		expect(failPath(body({ messages: [msg('q'), tooLong, msg('q')] }))).toBe('messages.1.parts');
	});
	it('does not count non-text parts (reasoning, tool, step-start) toward messageChars', () => {
		const a = {
			role: 'assistant',
			parts: [
				{ type: 'step-start' },
				{ type: 'reasoning', text: 'r'.repeat(50) },
				{ type: 'tool-readPage', toolCallId: 't', state: 'output-available', input: {}, output: 'o' },
				{ type: 'text', text: 'ok' }
			]
		};
		const roomy = createBodySchema({ ...limits, messages: 10 });
		expect(roomy.safeParse(body({ messages: [msg('q'), a, msg('q')] })).success).toBe(true);
	});
	it('caps the whole messages array', () => {
		const a = { role: 'assistant', parts: [{ type: 'reasoning', text: 'r'.repeat(3 * 10 * 10) }] };
		expect(failPath(body({ messages: [msg('q'), a, msg('q')] }))).toBe('messages');
	});
	it('accepts dom up to the pageChars ceiling when given', () => {
		const s = createBodySchema(limits, { pageChars: 40 });
		const ok = s.safeParse(body({ aide: { route: '/', sessionId: 's', dom: 'x'.repeat(40) } }));
		expect(ok.success).toBe(true);
		const r = s.safeParse(body({ aide: { route: '/', sessionId: 's', dom: 'x'.repeat(41) } }));
		expect(r.error!.issues[0]!.path.join('.')).toBe('aide.dom');
	});
	it('rejects role system', () => {
		expect(failPath(body({ messages: [msg('hi', 'system')] }))).toBe('messages.0.role');
	});
	it('rejects dom longer than pageChars', () => {
		expect(failPath(body({ aide: { route: '/', sessionId: 's', dom: 'x'.repeat(21) } }))).toBe(
			'aide.dom'
		);
	});
	it('rejects a missing aide.route', () => {
		expect(failPath(body({ aide: { sessionId: 's', dom: null } }))).toBe('aide.route');
	});
});

describe('strings', () => {
	it('has a sentence for every refusal code, in both tables', () => {
		const codes = Object.keys(REFUSAL_MESSAGES);
		expect(codes.sort()).toEqual(
			[
				'budget_exhausted',
				'invalid_request',
				'method_not_allowed',
				'origin_refused',
				'provider_error',
				'rate_limited',
				'unauthorized'
			].sort()
		);
		for (const code of codes) expect(DEFAULT_STRINGS.errors[code as keyof typeof REFUSAL_MESSAGES]).toBeTruthy();
		expect(DEFAULT_STRINGS.errors.network).toBeTruthy();
		expect(DEFAULT_STRINGS.disclosure('Anthropic')).toContain('Anthropic');
	});
});
