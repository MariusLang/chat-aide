import { z } from 'zod';
import {
	BUDGET_DEFAULTS,
	CACHE_DEFAULTS,
	LIMIT_CEILINGS,
	LIMIT_DEFAULTS,
	LIMIT_NAMES,
	MAX_ROUTE_LENGTH,
	RATE_LIMIT_DEFAULTS,
	type LimitName,
	type Limits
} from './limits.js';
import type {
	AideConfig,
	AideRequestMeta,
	AuthorizeFn,
	Callbacks,
	ClientKeyFn,
	Page,
	ResolvedConfig,
	Store,
	WaitUntilFn
} from './types.js';

/** Thrown by `resolveConfig`; `message` is `'<path>: <reason>'`. */
export class AideConfigError extends Error {
	readonly path: string;
	constructor(path: string, reason: string) {
		super(`${path || 'config'}: ${reason}`);
		this.name = 'AideConfigError';
		this.path = path;
	}
}

// The one place this name is spelled (spec §3.2): the refusal, and why.
const REFUSED_PROVIDER = 'gateway';
const REFUSED_PROVIDER_MESSAGE =
	'Vercel AI Gateway is not supported: it routes every request through Vercel, a third party ' +
	'between this site and the provider the developer chose. Name the provider directly ' +
	"(e.g. 'anthropic', 'openai') or hand a model in as 'custom'.";

const fn = <T>() =>
	z.custom<T>((v) => typeof v === 'function', { message: 'must be a function' });

const nonEmpty = z.string().min(1, { message: 'must be a non-empty string' });
const positiveInt = z.number().int().positive();

/** `scheme://host[:port]` of an http(s) URL with no path, query, hash or credentials; else null. */
export function normalizeOrigin(value: string): string | null {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
	if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) return null;
	if (/[?#]/.test(value)) return null;
	return url.origin;
}

const origin = z.string().transform((value, ctx) => {
	const normalized = normalizeOrigin(value);
	if (normalized === null) {
		ctx.addIssue({
			code: 'custom',
			message: `must be an http(s) origin with no path, like 'https://example.com' (got '${value}')`
		});
		return z.NEVER;
	}
	return normalized;
});

const providerSchema = z.strictObject({
	name: nonEmpty.refine((n) => !n.trim().toLowerCase().includes(REFUSED_PROVIDER), {
		message: REFUSED_PROVIDER_MESSAGE
	}),
	model: nonEmpty,
	apiKey: z.string().optional(),
	baseURL: z.string().optional(),
	headers: z.record(z.string(), z.string()).optional(),
	options: z.record(z.string(), z.unknown()).optional(),
	region: z.string().optional(),
	accessKeyId: z.string().optional(),
	secretAccessKey: z.string().optional(),
	sessionToken: z.string().optional(),
	project: z.string().optional(),
	location: z.string().optional(),
	credentials: z.unknown().optional(),
	resourceName: z.string().optional(),
	apiVersion: z.string().optional(),
	routing: z.record(z.string(), z.unknown()).optional(),
	instance: z
		.custom<NonNullable<AideConfig['provider']['instance']>>(
			(v) => typeof v === 'object' && v !== null,
			{ message: 'must be a LanguageModel instance, not a model-id string' }
		)
		.optional()
}).superRefine((p, ctx) => {
	// A gateway model handed in as 'custom' is the same third party by another door.
	const id = (p.instance as { provider?: unknown } | undefined)?.provider;
	if (
		p.name.trim().toLowerCase() === 'custom' &&
		typeof id === 'string' &&
		id.trim().toLowerCase().startsWith(REFUSED_PROVIDER)
	)
		ctx.addIssue({
			code: 'custom',
			path: ['instance'],
			message: `${REFUSED_PROVIDER_MESSAGE} (provider.instance is a '${id}' model.)`
		});
});

const limitsShape = Object.fromEntries(
	LIMIT_NAMES.map((name) => [name, positiveInt.optional()])
) as Record<LimitName, z.ZodOptional<typeof positiveInt>>;

const storeSchema = z.custom<Store>(
	(v) =>
		typeof v === 'object' &&
		v !== null &&
		['incr', 'get', 'set'].every((k) => typeof (v as Record<string, unknown>)[k] === 'function'),
	{ message: 'must implement incr, get and set' }
);

const configSchema = z
	.strictObject({
		provider: providerSchema,
		pages: z
			.strictObject({
				include: z.array(z.string()).optional(),
				exclude: z.array(z.string()).optional(),
				source: fn<() => Promise<Page[]>>().optional()
			})
			.optional(),
		llms: z
			.strictObject({
				read: z.boolean().optional(),
				preferMarkdown: z.boolean().optional(),
				serve: z.boolean().optional(),
				serveSource: z.boolean().optional()
			})
			.optional(),
		endpoint: z
			.string()
			.startsWith('/', { message: "must be a path starting with '/'" })
			.refine((s) => !s.startsWith('//'), { message: "must be a path starting with one '/'" })
			.optional(),
		cache: z.strictObject({ ttlSeconds: positiveInt.optional() }).optional(),
		origin: origin.optional(),
		waitUntil: fn<WaitUntilFn>().optional(),
		systemPrompt: z.union([z.string(), fn<Exclude<ResolvedConfig['systemPrompt'], string | undefined>>()]).optional(),
		persona: z
			.strictObject({
				name: z.string().optional(),
				tone: z.string().optional(),
				language: z.string().optional(),
				audience: z.string().optional(),
				refusals: z.array(z.string()).optional()
			})
			.optional(),
		facts: z.union([z.string(), z.array(z.string())]).optional(),
		pageContext: z.enum(['server', 'dom', 'auto']).optional(),
		limits: z.strictObject(limitsShape).optional(),
		limitCeilings: z.strictObject(limitsShape).optional(),
		rateLimit: z
			.union([
				z.literal(false),
				z.strictObject({
					requests: positiveInt.optional(),
					windowSeconds: positiveInt.optional(),
					warmups: positiveInt.optional()
				})
			])
			.optional(),
		budget: z
			.union([
				z.literal(false),
				z.strictObject({
					tokensPerDay: z.union([positiveInt, z.literal(false)]).optional(),
					siteTokensPerDay: z.union([positiveInt, z.literal(false)]).optional()
				})
			])
			.optional(),
		store: storeSchema.optional(),
		salt: nonEmpty.optional(),
		allowedOrigins: z.array(origin).optional(),
		authorize: fn<AuthorizeFn>().optional(),
		clientKey: fn<ClientKeyFn>().optional(),
		caching: z.boolean().optional(),
		suggestions: z
			.union([z.array(z.string()), z.record(z.string(), z.array(z.string()))])
			.optional(),
		onMessage: fn<NonNullable<Callbacks['onMessage']>>().optional(),
		onResponse: fn<NonNullable<Callbacks['onResponse']>>().optional(),
		onRefused: fn<NonNullable<Callbacks['onRefused']>>().optional(),
		onError: fn<NonNullable<Callbacks['onError']>>().optional()
	})
	.superRefine((c, ctx) => {
		if (c.store !== undefined && c.salt === undefined)
			ctx.addIssue({
				code: 'custom',
				path: ['salt'],
				message: 'is required when store is set, so every instance keys clients the same way'
			});
		if (c.salt !== undefined && c.store === undefined)
			ctx.addIssue({
				code: 'custom',
				path: ['store'],
				message: 'is required when salt is set; the per-process salt is right for the in-memory store'
			});
		for (const name of LIMIT_NAMES) {
			const value = c.limits?.[name] ?? LIMIT_DEFAULTS[name];
			const ceiling = c.limitCeilings?.[name] ?? LIMIT_CEILINGS[name];
			if (value > ceiling)
				ctx.addIssue({
					code: 'custom',
					path: ['limits', name],
					message: `${value} is above the ceiling ${ceiling}; raise it deliberately with limitCeilings: { ${name}: ${value} }`
				});
		}
	});

function fill(overrides: Partial<Limits> | undefined, defaults: Limits): Limits {
	const out = { ...defaults };
	for (const name of LIMIT_NAMES) {
		const v = overrides?.[name];
		if (v !== undefined) out[name] = v;
	}
	return out;
}

/** Validates a config (spec §5) and fills every default. Throws `AideConfigError` on the first failure. */
export function resolveConfig(input: unknown): ResolvedConfig {
	const parsed = configSchema.safeParse(input);
	if (!parsed.success) {
		const issue = parsed.error.issues[0]!;
		throw new AideConfigError(issue.path.map(String).join('.'), issue.message);
	}
	const c = parsed.data;
	const { rateLimit, budget } = c;
	return {
		provider: c.provider,
		pages: {
			include: c.pages?.include ?? [],
			exclude: c.pages?.exclude ?? [],
			...(c.pages?.source ? { source: c.pages.source } : {})
		},
		llms: {
			read: c.llms?.read ?? true,
			preferMarkdown: c.llms?.preferMarkdown ?? true,
			serve: c.llms?.serve ?? true,
			serveSource: c.llms?.serveSource ?? false
		},
		endpoint: c.endpoint ?? '/api/chat',
		cache: {
			ttlSeconds: c.cache?.ttlSeconds ?? CACHE_DEFAULTS.ttlSeconds,
			missSeconds: CACHE_DEFAULTS.missSeconds
		},
		origin: c.origin,
		waitUntil: c.waitUntil,
		systemPrompt: c.systemPrompt,
		persona: c.persona,
		facts: c.facts === undefined ? [] : typeof c.facts === 'string' ? [c.facts] : c.facts,
		pageContext: c.pageContext ?? 'auto',
		limits: fill(c.limits, LIMIT_DEFAULTS),
		limitCeilings: fill(c.limitCeilings, LIMIT_CEILINGS),
		rateLimit:
			rateLimit === false
				? false
				: {
						requests: rateLimit?.requests ?? RATE_LIMIT_DEFAULTS.requests,
						windowSeconds: rateLimit?.windowSeconds ?? RATE_LIMIT_DEFAULTS.windowSeconds,
						warmups: rateLimit?.warmups ?? RATE_LIMIT_DEFAULTS.warmups
					},
		budget:
			budget === false
				? false
				: {
						tokensPerDay: budget?.tokensPerDay ?? BUDGET_DEFAULTS.tokensPerDay,
						siteTokensPerDay: budget?.siteTokensPerDay ?? BUDGET_DEFAULTS.siteTokensPerDay
					},
		store: c.store,
		salt: c.salt,
		allowedOrigins: c.allowedOrigins ?? [],
		authorize: c.authorize,
		clientKey: c.clientKey,
		caching: c.caching ?? true,
		suggestions: c.suggestions,
		onMessage: c.onMessage,
		onResponse: c.onResponse,
		onRefused: c.onRefused,
		onError: c.onError
	};
}

export interface UIMessageLike {
	id?: string;
	role: 'user' | 'assistant';
	parts: { type: string; text?: string }[];
}

export interface AideBody {
	id?: string;
	messages: UIMessageLike[];
	aide: AideRequestMeta;
}

/** Parts per user message; the widget sends one. */
export const USER_MAX_PARTS = 20;
/** Parts per assistant message (text, reasoning, tool and step parts of a multi-step answer). */
export const ASSISTANT_MAX_PARTS = 50;
/**
 * An assistant message may carry up to this many times `messageChars` of text: a
 * `maxOutputTokens` answer can be longer than `messageChars`, and a long answer must not make
 * the next request fail. The history window truncates it to `messageChars` anyway.
 */
export const ASSISTANT_CHARS_FACTOR = 8;
/** Sanity cap on the serialised `messages` array: `messages` x `messageChars` x this. */
export const BODY_CHARS_FACTOR = 10;

const textChars = (parts: { type: string; text?: string }[]): number => {
	let n = 0;
	for (const p of parts) if (p.type === 'text' && typeof p.text === 'string') n += p.text.length;
	return n;
};

/**
 * The POST body (spec §6). Checks shape and size only; the route rule is applied by the handler.
 * Extra AI SDK fields (trigger, messageId, part metadata, non-text parts) are tolerated.
 *
 * Sizes: a user message's text parts together hold at most `limits.messageChars` in at most
 * `USER_MAX_PARTS` parts; an assistant message's at most `messageChars x ASSISTANT_CHARS_FACTOR`
 * in at most `ASSISTANT_MAX_PARTS`. Non-text parts are not counted, only bounded by the
 * whole-array sanity cap. `aide.dom` is accepted up to `ceilings.pageChars` (the handler
 * truncates it to `limits.pageChars`); without `ceilings`, up to `limits.pageChars`.
 */
export function createBodySchema(
	limits: Pick<Limits, 'messages' | 'messageChars' | 'pageChars'>,
	ceilings?: Partial<Pick<Limits, 'pageChars'>>
): z.ZodType<AideBody> {
	const part = z.looseObject({
		type: z.string().min(1),
		text: z.string().optional()
	});
	const message = z
		.looseObject({
			id: z.string().max(256).optional(),
			role: z.enum(['user', 'assistant']),
			parts: z.array(part)
		})
		.superRefine((m, ctx) => {
			const user = m.role === 'user';
			const maxParts = user ? USER_MAX_PARTS : ASSISTANT_MAX_PARTS;
			const maxChars = user ? limits.messageChars : limits.messageChars * ASSISTANT_CHARS_FACTOR;
			if (m.parts.length > maxParts)
				ctx.addIssue({
					code: 'custom',
					path: ['parts'],
					message: `a ${m.role} message has at most ${maxParts} parts`
				});
			else if (textChars(m.parts) > maxChars)
				ctx.addIssue({
					code: 'custom',
					path: ['parts'],
					message: `a ${m.role} message's text is at most ${maxChars} characters`
				});
		});
	const bodyChars = limits.messages * limits.messageChars * BODY_CHARS_FACTOR;
	return z.looseObject({
		id: z.string().max(256).optional(),
		messages: z
			.array(message)
			.min(1)
			.max(limits.messages)
			.superRefine((messages, ctx) => {
				if (JSON.stringify(messages).length > bodyChars)
					ctx.addIssue({ code: 'custom', message: `messages exceed ${bodyChars} characters` });
			}),
		aide: z.object({
			route: z.string().min(1).max(MAX_ROUTE_LENGTH).startsWith('/'),
			sessionId: z.string().min(1).max(256),
			dom: z
				.string()
				.max(Math.max(limits.pageChars, ceilings?.pageChars ?? 0))
				.nullable()
				.optional()
				.transform((v) => v ?? null)
		})
	});
}
