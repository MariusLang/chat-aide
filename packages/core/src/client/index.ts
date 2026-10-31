/**
 * `@chat-aide/core/client`: the browser half every widget shares, whatever renders it. The
 * per-tab session and thread, the warm-up, the request body, the refusal codes and the `aide:*`
 * window events live here; the Svelte store and the React hook only add reactivity on top.
 * Browser-safe: no Node or server imports, and every browser API is touched only when it exists.
 */
import type { UIMessage } from 'ai';
import { LIMIT_DEFAULTS } from '../shared/limits.js';
import { DEFAULT_STRINGS, type Strings } from '../shared/strings.js';
import type { Suggestions, Usage, WarmupResponse } from '../shared/types.js';
import { extract } from '../site/extract.js';

export { DEFAULT_STRINGS, REFUSAL_MESSAGES, type Strings } from '../shared/strings.js';
export { LIMIT_DEFAULTS } from '../shared/limits.js';
export { parseAnswer, type MdBlock, type MdInline, type MdOptions } from '../shared/markdown.js';
export { extract, type Extracted } from '../site/extract.js';
export { trapFocus, focusableIn, type FocusTrapOptions } from './focus-trap.js';
export { fitViewport, PHONE_QUERY, type FitViewportOptions } from './viewport.js';
export type { Suggestions, Usage, WarmupResponse } from '../shared/types.js';

export type AnswerLinks = 'same-origin' | 'any';
export type WidgetPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export type WidgetMode = 'floating' | 'inline' | 'sheet';
export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error';

export interface ChatError {
	/** A refusal code of §6 (`rate_limited`, `provider_error`, …) or `network`. */
	code: string;
	message: string;
}

/** Options every widget takes, whatever the framework. */
export interface ChatOptions {
	/** The chat endpoint (default `/api/chat`). */
	endpoint?: string;
	/** Keep the thread in `sessionStorage` for the tab (default `true`). */
	persistThread?: boolean;
	/** Which answer links survive (default `'same-origin'`, spec §3.6). */
	answerLinks?: AnswerLinks;
	/** Any subset of the visible strings. */
	strings?: Partial<Strings>;
	/** Suggestions for the empty state: a list, or a map by route (`'*'` is the fallback). */
	suggestions?: Suggestions;
	onopen?(): void;
	onclose?(): void;
	onsend?(text: string): void;
	onresponse?(text: string, usage?: Usage): void;
	onerror?(code: string): void;
	/** A fetch implementation (tests, proxies). Defaults to the global `fetch`. */
	fetch?: typeof fetch;
}

export const SESSION_KEY = 'aide:session';
export const THREAD_KEY = 'aide:thread';
export const MAX_SUGGESTIONS = 4;
export const DEFAULT_ENDPOINT = '/api/chat';

export function storageGet(key: string): string | null {
	try {
		return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(key);
	} catch {
		return null;
	}
}

export function storageSet(key: string, value: string): void {
	try {
		if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, value);
	} catch {
		// Storage blocked or full: the thread simply is not kept.
	}
}

function randomId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

/** The tab's session id, minted and stored on first use. */
export function sessionIdForTab(): string {
	let id = storageGet(SESSION_KEY) ?? '';
	if (!id) {
		id = randomId();
		storageSet(SESSION_KEY, id);
	}
	return id;
}

export function currentPath(): string {
	return typeof location === 'undefined' ? '/' : location.pathname || '/';
}

/** Fires one of the `aide:*` window events tag managers listen for. */
export function dispatch(name: string, detail: unknown): void {
	if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
	window.dispatchEvent(new CustomEvent(name, { detail }));
}

function isMessageList(value: unknown): value is UIMessage[] {
	return (
		Array.isArray(value) &&
		value.every(
			(m) =>
				m !== null &&
				typeof m === 'object' &&
				typeof (m as UIMessage).id === 'string' &&
				((m as UIMessage).role === 'user' || (m as UIMessage).role === 'assistant') &&
				Array.isArray((m as UIMessage).parts)
		)
	);
}

/** The thread kept for this tab, or `[]`. */
export function restoreThread(): UIMessage[] {
	const raw = storageGet(THREAD_KEY);
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		return isMessageList(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export function saveThread(messages: UIMessage[]): void {
	storageSet(THREAD_KEY, JSON.stringify(messages));
}

/** The concatenated text parts of a message. */
export function messageText(message: UIMessage): string {
	return message.parts
		.map((p) => (p.type === 'text' ? p.text : ''))
		.join('')
		.trim();
}

export function mergeStrings(overrides: Partial<Strings> | undefined): Strings {
	return {
		...DEFAULT_STRINGS,
		...overrides,
		errors: { ...DEFAULT_STRINGS.errors, ...overrides?.errors }
	};
}

/** Up to four suggestions for `route`: the widget's own, else the server's. */
export function pickSuggestions(source: Suggestions | undefined, route: string, fromServer: string[]): string[] {
	let list: string[] | null = null;
	if (source) list = Array.isArray(source) ? source : (source[route] ?? source['*'] ?? null);
	return (list ?? fromServer).slice(0, MAX_SUGGESTIONS);
}

export function usageOf(message: UIMessage): Usage | undefined {
	const meta = message.metadata;
	if (meta && typeof meta === 'object' && 'usage' in meta) {
		const usage = (meta as { usage?: unknown }).usage;
		if (usage && typeof usage === 'object') return usage as Usage;
	}
	return undefined;
}

export type ClientLimits = NonNullable<WarmupResponse['limits']>;

export const DEFAULT_CLIENT_LIMITS: ClientLimits = {
	messages: LIMIT_DEFAULTS.messages,
	messageChars: LIMIT_DEFAULTS.messageChars,
	pageChars: LIMIT_DEFAULTS.pageChars
};

function clientLimits(value: unknown): ClientLimits | null {
	if (!value || typeof value !== 'object') return null;
	const v = value as Record<string, unknown>;
	const ok = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;
	return ok(v.messages) && ok(v.messageChars) && ok(v.pageChars)
		? { messages: v.messages, messageChars: v.messageChars, pageChars: v.pageChars }
		: null;
}

/**
 * The thread as the server may receive it: text parts only (joined, cut to `messageChars`),
 * the most recent messages that fit `messages`, starting at a user message. The UI keeps the
 * whole thread; only the request is trimmed, so a long tab never gets stuck on a 400.
 */
export function trimForRequest(messages: UIMessage[], limits: ClientLimits): UIMessage[] {
	const out: UIMessage[] = [];
	for (const m of messages) {
		const text = m.parts
			.map((p) => (p.type === 'text' ? p.text : ''))
			.join('')
			.slice(0, limits.messageChars);
		if (text) out.push({ id: m.id, role: m.role, parts: [{ type: 'text', text }] });
	}
	let start = Math.max(0, out.length - Math.max(1, limits.messages));
	while (start < out.length - 1 && out[start]!.role !== 'user') start++;
	return out.slice(start);
}

/** What a warm-up tells the widget; `null` fields keep what the widget had. */
export interface WarmupResult {
	pageSource: WarmupResponse['pageSource'];
	suggestions: string[];
	provider: string | null;
	limits: ClientLimits | null;
}

/** `GET endpoint?route=`: `null` when it failed (the warm-up is an optimisation only). */
export async function fetchWarmup(endpoint: string, route: string, fetchImpl: typeof fetch): Promise<WarmupResult | null> {
	try {
		const res = await fetchImpl(`${endpoint}?route=${encodeURIComponent(route)}`, {
			method: 'GET',
			headers: { accept: 'application/json' },
			credentials: 'same-origin'
		});
		if (!res.ok) return null;
		const body = (await res.json()) as Partial<WarmupResponse>;
		return {
			pageSource: body.pageSource === 'dom' ? 'dom' : 'server',
			suggestions: Array.isArray(body.suggestions)
				? body.suggestions.filter((s): s is string => typeof s === 'string')
				: [],
			provider: typeof body.provider === 'string' && body.provider ? body.provider : null,
			limits: clientLimits(body.limits)
		};
	} catch {
		return null;
	}
}

/** The page's own text for the request, when the warm-up asked for it. */
export function domText(pageChars: number): string | null {
	if (typeof document === 'undefined') return null;
	try {
		return extract(document).text.slice(0, pageChars);
	} catch {
		return null;
	}
}

export interface Refusal {
	error: string;
	message: string;
}

/**
 * Wraps `fetch` so a non-2xx answer's `{ error, message }` body is kept before the AI SDK turns
 * it into a generic error. `last()` returns the refusal of the latest request, or `null`.
 */
export function refusalCapture(fetchImpl: typeof fetch): { fetch: typeof fetch; last(): Refusal | null } {
	let refusal: Refusal | null = null;
	const wrapped: typeof fetch = async (input, init) => {
		refusal = null;
		const response = await fetchImpl(input, init);
		if (!response.ok) {
			try {
				const body: unknown = await response.clone().json();
				if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
					const b = body as { error: string; message?: unknown };
					refusal = { error: b.error, message: typeof b.message === 'string' ? b.message : '' };
				}
			} catch {
				// Not JSON: reported as a provider error.
			}
		}
		return response;
	};
	return { fetch: wrapped, last: () => refusal };
}

/** The visible error for a failed turn: the refusal's code and message, or `network`. */
export function errorFor(refusal: Refusal | null, strings: Strings, overrides?: Partial<Strings>): ChatError {
	if (!refusal) return { code: 'network', message: strings.errors.network };
	const code = refusal.error;
	const override = overrides?.errors?.[code as keyof Strings['errors']];
	const fallback = (strings.errors as Record<string, string>)[code] ?? strings.errors.provider_error;
	return { code, message: override ?? (refusal.message || fallback) };
}

/** The body of one chat request: the AI SDK fields plus the library's `aide` block. */
export function requestBody(
	args: { id: string; messages: UIMessage[]; trigger: string; messageId: string | undefined },
	ctx: { route: string; sessionId: string; limits: ClientLimits; sendDom: boolean }
): Record<string, unknown> {
	return {
		id: args.id,
		messages: trimForRequest(args.messages, ctx.limits),
		trigger: args.trigger,
		messageId: args.messageId,
		aide: { route: ctx.route, sessionId: ctx.sessionId, dom: ctx.sendDom ? domText(ctx.limits.pageChars) : null }
	};
}
