/**
 * Every number of spec §3.5, spelled once beside its ceiling. Defaults are the developer's to
 * override; ceilings only catch typos and are raised with `limitCeilings`.
 */
export const LIMIT_DEFAULTS = {
	pageChars: 12_000,
	minPageChars: 200,
	outlineChars: 6_000,
	historyTurns: 12,
	historyChars: 16_000,
	maxOutputTokens: 1_024,
	maxSteps: 3,
	messageChars: 4_000,
	messages: 60,
	maxPages: 200,
	crawlConcurrency: 4,
	crawlBudgetMs: 1_500
} as const;

export const LIMIT_CEILINGS = {
	pageChars: 50_000,
	minPageChars: 5_000,
	outlineChars: 40_000,
	historyTurns: 50,
	historyChars: 100_000,
	maxOutputTokens: 8_192,
	maxSteps: 8,
	messageChars: 20_000,
	messages: 200,
	maxPages: 5_000,
	crawlConcurrency: 16,
	crawlBudgetMs: 10_000
} as const;

export type LimitName = keyof typeof LIMIT_DEFAULTS;
export type Limits = Record<LimitName, number>;

export const LIMIT_NAMES = Object.keys(LIMIT_DEFAULTS) as LimitName[];

export const RATE_LIMIT_DEFAULTS = { requests: 20, windowSeconds: 600, warmups: 60 } as const;
export const BUDGET_DEFAULTS = { tokensPerDay: 200_000, siteTokensPerDay: 5_000_000 } as const;
export const CACHE_DEFAULTS = { ttlSeconds: 3600, missSeconds: 60 } as const;
export const MAX_REDIRECTS = 3;
export const MAX_ROUTE_LENGTH = 512;
