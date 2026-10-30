import type { LanguageModel } from 'ai';
import type { Limits } from './limits.js';

/**
 * What the handlers need from a request, whatever the framework. SvelteKit's `RequestEvent`
 * already has this shape; other frameworks get one from `toAideEvent(request, …)`.
 */
export interface AideEvent {
	request: Request;
	url: URL;
	/**
	 * The framework's in-process fetch. Used for reads of the site only when an adapter marked the
	 * event as its own (`markHooked`); otherwise reads go over the network to `origin`.
	 */
	fetch: typeof fetch;
	/** The visitor's address, as the framework or its proxy reports it. */
	getClientAddress(): string;
	/** Platform context (Cloudflare, Netlify): `platform.context.waitUntil` is used when present. */
	platform?: unknown;
	/** True for a request the app made to itself (SvelteKit `event.fetch`). */
	isSubRequest?: boolean;
}

/** The one interface for shared state (spec §3.5). */
export interface Store {
	/** Adds `by` (negative too) to a counter; creates it with `ttlSeconds` when missing. */
	incr(key: string, by: number, ttlSeconds: number): Promise<number>;
	get(key: string): Promise<string | null>;
	set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export interface Heading {
	level: 1 | 2 | 3;
	text: string;
}

export interface Page {
	route: string;
	title: string;
	description?: string;
	headings: Heading[];
	text: string;
}

export interface PageEntry extends Page {
	hash: string;
	thin: boolean;
	source: 'render' | 'markdown' | 'llms-full' | 'source';
	fetchedAt: number;
}

export type ProviderConfig = {
	name: string;
	model: string;
	apiKey?: string;
	baseURL?: string;
	headers?: Record<string, string>;
	options?: Record<string, unknown>;
	region?: string;
	accessKeyId?: string;
	secretAccessKey?: string;
	sessionToken?: string;
	project?: string;
	location?: string;
	credentials?: unknown;
	resourceName?: string;
	apiVersion?: string;
	routing?: Record<string, unknown>;
	/** A `LanguageModel` instance, for `name: 'custom'`. Never a model-id string. */
	instance?: Exclude<LanguageModel, string>;
};

export interface Persona {
	name?: string;
	tone?: string;
	language?: string;
	audience?: string;
	refusals?: string[];
}

export interface PromptContext {
	route: string;
	site: { title: string; summary?: string };
	persona?: Persona;
}

export type ErrorCode =
	| 'invalid_request'
	| 'origin_refused'
	| 'rate_limited'
	| 'budget_exhausted'
	| 'unauthorized'
	| 'provider_error'
	| 'method_not_allowed';

export interface AideRequestMeta {
	route: string;
	sessionId: string;
	dom: string | null;
}

export interface WarmupResponse {
	pageSource: 'server' | 'dom';
	suggestions: string[];
	mapped: boolean;
	/** The provider's display name (e.g. 'Anthropic'), for the widget's disclosure. */
	provider?: string;
	/** The resolved limits the client trims its outgoing body to (thread length, message and page size). */
	limits?: { messages: number; messageChars: number; pageChars: number };
}

export interface ErrorResponse {
	error: ErrorCode;
	message: string;
}

export interface Usage {
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
	inputTokenDetails?: { noCacheTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number };
	outputTokenDetails?: { textTokens?: number; reasoningTokens?: number };
}

export interface MessageEvent {
	sessionId: string;
	route: string;
	text: string;
	at: Date;
}

export interface ResponseEvent {
	sessionId: string;
	route: string;
	text: string;
	usage: Usage;
	model: string;
	provider: string;
	durationMs: number;
	finishReason: string;
	toolCalls: { name: string; input: unknown }[];
	at: Date;
}

export interface RefusedEvent {
	sessionId: string | null;
	code: ErrorCode;
	at: Date;
}

export interface ErrorEvent {
	sessionId: string | null;
	error: unknown;
	at: Date;
}

export type PageContextMode = 'server' | 'dom' | 'auto';
export type Suggestions = string[] | Record<string, string[]>;
export type SystemPrompt = string | ((ctx: PromptContext) => string);
export type AuthorizeFn<E extends AideEvent = AideEvent> = (
	event: E
) => boolean | Response | Promise<boolean | Response>;
export type ClientKeyFn<E extends AideEvent = AideEvent> = (event: E) => string;
export type WaitUntilFn = (promise: Promise<unknown>) => void;

export interface RateLimitConfig {
	requests: number;
	windowSeconds: number;
	warmups: number;
}

export interface BudgetConfig {
	tokensPerDay: number | false;
	siteTokensPerDay: number | false;
}

export interface LlmsConfig {
	read: boolean;
	preferMarkdown: boolean;
	serve: boolean;
	serveSource: boolean;
}

export interface Callbacks {
	onMessage?: (event: MessageEvent) => unknown;
	onResponse?: (event: ResponseEvent) => unknown;
	onRefused?: (event: RefusedEvent) => unknown;
	onError?: (event: ErrorEvent) => unknown;
}

/**
 * The developer's configuration, exactly spec §5 plus `suggestions` for the warm-up. `E` is the
 * framework's request event, as `authorize` and `clientKey` receive it.
 */
export interface AideConfig<E extends AideEvent = AideEvent> extends Callbacks {
	provider: ProviderConfig;
	pages?: { include?: string[]; exclude?: string[]; source?: () => Promise<Page[]> };
	llms?: Partial<LlmsConfig>;
	endpoint?: string;
	cache?: { ttlSeconds?: number };
	origin?: string;
	waitUntil?: WaitUntilFn;
	systemPrompt?: SystemPrompt;
	persona?: Persona;
	facts?: string | string[];
	pageContext?: PageContextMode;
	limits?: Partial<Limits>;
	limitCeilings?: Partial<Limits>;
	rateLimit?: Partial<RateLimitConfig> | false;
	budget?: Partial<BudgetConfig> | false;
	store?: Store;
	salt?: string;
	allowedOrigins?: string[];
	authorize?: AuthorizeFn<E>;
	clientKey?: ClientKeyFn<E>;
	caching?: boolean;
	suggestions?: Suggestions;
}

/** `AideConfig` after `resolveConfig`: every default filled, origins normalised. */
export interface ResolvedConfig<E extends AideEvent = AideEvent> extends Callbacks {
	provider: ProviderConfig;
	pages: { include: string[]; exclude: string[]; source?: () => Promise<Page[]> };
	llms: LlmsConfig;
	endpoint: string;
	cache: { ttlSeconds: number; missSeconds: number };
	/** Normalised origin (`scheme://host[:port]`), or undefined: reads then use the in-process sentinel. */
	origin?: string;
	waitUntil?: WaitUntilFn;
	systemPrompt?: SystemPrompt;
	persona?: Persona;
	facts: string[];
	pageContext: PageContextMode;
	limits: Limits;
	limitCeilings: Limits;
	rateLimit: RateLimitConfig | false;
	budget: BudgetConfig | false;
	store?: Store;
	salt?: string;
	allowedOrigins: string[];
	authorize?: AuthorizeFn<E>;
	clientKey?: ClientKeyFn<E>;
	caching: boolean;
	suggestions?: Suggestions;
}
