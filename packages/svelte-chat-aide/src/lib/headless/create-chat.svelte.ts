/**
 * The headless chat store (spec §3.7 client callbacks, §3.8, §3.9 layer 1, §3.10, §6).
 *
 * A runes store over `@ai-sdk/svelte`'s `Chat`: it adds the `aide` request fields, the warm-up,
 * the refusal codes, the client callbacks and `aide:*` events, and the per-tab thread. Safe to
 * create during SSR: every browser API is touched only when it exists.
 */
import { Chat } from '@ai-sdk/svelte';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { extract } from '../site/extract';
import { LIMIT_DEFAULTS } from '../shared/limits';
import { DEFAULT_STRINGS, type Strings } from '../shared/strings';
import type { Suggestions, Usage, WarmupResponse } from '../shared/types';

export type AnswerLinks = 'same-origin' | 'any';
export type WidgetPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export type WidgetMode = 'floating' | 'inline' | 'sheet';
export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error';

export interface ChatError {
	/** A refusal code of §6 (`rate_limited`, `provider_error`, …) or `network`. */
	code: string;
	message: string;
}

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

export interface ChatStore {
	readonly messages: UIMessage[];
	readonly status: ChatStatus;
	readonly error: ChatError | null;
	readonly isOpen: boolean;
	/** Up to four suggestions for the current route. */
	readonly suggestions: string[];
	readonly strings: Strings;
	readonly route: string;
	readonly answerLinks: AnswerLinks;
	send(text: string): Promise<void>;
	stop(): void;
	retry(): Promise<void>;
	open(): void;
	close(): void;
	toggle(): void;
	/** `GET endpoint?route=`; stores the page source and the server's suggestions. */
	warmup(route: string): Promise<void>;
	sessionId: string;
}

const SESSION_KEY = 'aide:session';
const THREAD_KEY = 'aide:thread';
const MAX_SUGGESTIONS = 4;

function storageGet(key: string): string | null {
	try {
		return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(key);
	} catch {
		return null;
	}
}

function storageSet(key: string, value: string): void {
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

function currentPath(): string {
	return typeof location === 'undefined' ? '/' : location.pathname || '/';
}

function dispatch(name: string, detail: unknown): void {
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

function restoreThread(): UIMessage[] {
	const raw = storageGet(THREAD_KEY);
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		return isMessageList(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

/** The concatenated text parts of a message. */
export function messageText(message: UIMessage): string {
	return message.parts
		.map((p) => (p.type === 'text' ? p.text : ''))
		.join('')
		.trim();
}

function mergeStrings(overrides: Partial<Strings> | undefined): Strings {
	return {
		...DEFAULT_STRINGS,
		...overrides,
		errors: { ...DEFAULT_STRINGS.errors, ...overrides?.errors }
	};
}

function pickSuggestions(source: Suggestions | undefined, route: string): string[] | null {
	if (!source) return null;
	if (Array.isArray(source)) return source;
	return source[route] ?? source['*'] ?? null;
}

function usageOf(message: UIMessage): Usage | undefined {
	const meta = message.metadata;
	if (meta && typeof meta === 'object' && 'usage' in meta) {
		const usage = (meta as { usage?: unknown }).usage;
		if (usage && typeof usage === 'object') return usage as Usage;
	}
	return undefined;
}

export function createChat(options: ChatOptions = {}): ChatStore {
	const endpoint = options.endpoint ?? '/api/chat';
	const persist = options.persistThread ?? true;
	const answerLinks: AnswerLinks = options.answerLinks ?? 'same-origin';
	const strings = mergeStrings(options.strings);
	const baseFetch: typeof fetch = (...args) => (options.fetch ?? globalThis.fetch)(...args);

	let sessionId = storageGet(SESSION_KEY) ?? '';
	if (!sessionId) {
		sessionId = randomId();
		storageSet(SESSION_KEY, sessionId);
	}

	let isOpen = $state(false);
	let route = $state(currentPath());
	let pageSource: WarmupResponse['pageSource'] = 'server';
	let serverSuggestions = $state<string[]>([]);
	let error = $state<ChatError | null>(null);
	/** The refusal body of the last non-2xx POST, read by the fetch wrapper before the SDK throws. */
	let refusal: { error: string; message: string } | null = null;

	const save = (messages: UIMessage[]): void => {
		if (persist) storageSet(THREAD_KEY, JSON.stringify(messages));
	};

	const fail = (code: string, message: string): void => {
		error = { code, message };
		options.onerror?.(code);
		dispatch('aide:error', { code });
	};

	const postFetch: typeof fetch = async (input, init) => {
		refusal = null;
		const response = await baseFetch(input, init);
		if (!response.ok) {
			try {
				const body: unknown = await response.clone().json();
				if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
					const b = body as { error: string; message?: unknown };
					refusal = { error: b.error, message: typeof b.message === 'string' ? b.message : '' };
				}
			} catch {
				// Not JSON: reported as a provider error below.
			}
		}
		return response;
	};

	const domText = (): string | null => {
		if (typeof document === 'undefined') return null;
		try {
			return extract(document).text.slice(0, LIMIT_DEFAULTS.pageChars);
		} catch {
			return null;
		}
	};

	const chat = new Chat<UIMessage>({
		messages: persist ? restoreThread() : [],
		transport: new DefaultChatTransport<UIMessage>({
			api: endpoint,
			fetch: postFetch,
			prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => {
				const path = currentPath();
				route = path;
				return {
					body: {
						id,
						messages,
						trigger,
						messageId,
						aide: { route: path, sessionId, dom: pageSource === 'dom' ? domText() : null }
					}
				};
			}
		}),
		onError: () => {
			if (refusal) {
				const code = refusal.error;
				const override = options.strings?.errors?.[code as keyof Strings['errors']];
				const fallback = (strings.errors as Record<string, string>)[code] ?? strings.errors.provider_error;
				fail(code, override ?? (refusal.message || fallback));
			} else {
				fail('network', strings.errors.network);
			}
		},
		onFinish: ({ message, messages, isAbort, isDisconnect, isError }) => {
			save(messages);
			if (isAbort || isDisconnect || isError || message.role !== 'assistant') return;
			const text = messageText(message);
			const usage = usageOf(message);
			options.onresponse?.(text, usage);
			dispatch('aide:response', usage === undefined ? { text } : { text, usage });
		}
	});

	const busy = (): boolean => chat.status === 'submitted' || chat.status === 'streaming';

	async function send(text: string): Promise<void> {
		const value = text.trim();
		if (!value || busy()) return;
		error = null;
		chat.clearError();
		options.onsend?.(value);
		dispatch('aide:send', { text: value });
		await chat.sendMessage({ text: value });
		save(chat.messages);
	}

	async function retry(): Promise<void> {
		if (busy() || !chat.messages.some((m) => m.role === 'user')) return;
		error = null;
		chat.clearError();
		// Drop everything after the last user message, then ask again.
		while (chat.messages.length && chat.messages.at(-1)!.role !== 'user') {
			chat.messages = chat.messages.slice(0, -1);
		}
		await chat.regenerate();
		save(chat.messages);
	}

	async function warmup(path: string): Promise<void> {
		route = path;
		try {
			const res = await baseFetch(`${endpoint}?route=${encodeURIComponent(path)}`, {
				method: 'GET',
				headers: { accept: 'application/json' },
				credentials: 'same-origin'
			});
			if (!res.ok) return;
			const body = (await res.json()) as Partial<WarmupResponse>;
			if (route !== path) return; // a newer navigation won
			pageSource = body.pageSource === 'dom' ? 'dom' : 'server';
			serverSuggestions = Array.isArray(body.suggestions)
				? body.suggestions.filter((s): s is string => typeof s === 'string')
				: [];
		} catch {
			// The warm-up is an optimisation; a failure leaves the defaults.
		}
	}

	function open(): void {
		if (isOpen) return;
		isOpen = true;
		options.onopen?.();
		dispatch('aide:open', {});
		void warmup(currentPath());
	}

	function close(): void {
		if (!isOpen) return;
		isOpen = false;
		options.onclose?.();
		dispatch('aide:close', {});
	}

	return {
		get messages() {
			return chat.messages;
		},
		get status() {
			return chat.status as ChatStatus;
		},
		get error() {
			return error;
		},
		get isOpen() {
			return isOpen;
		},
		get suggestions() {
			const list = pickSuggestions(options.suggestions, route) ?? serverSuggestions;
			return list.slice(0, MAX_SUGGESTIONS);
		},
		get strings() {
			return strings;
		},
		get route() {
			return route;
		},
		get answerLinks() {
			return answerLinks;
		},
		sessionId,
		send,
		stop: () => void chat.stop(),
		retry,
		open,
		close,
		toggle: () => (isOpen ? close() : open()),
		warmup
	};
}
