/**
 * The headless chat store (spec §3.7 client callbacks, §3.8, §3.9 layer 1, §3.10, §6).
 *
 * A runes store over `@ai-sdk/svelte`'s `Chat`: it adds the `aide` request fields, the warm-up,
 * the refusal codes, the client callbacks and `aide:*` events, and the per-tab thread. Safe to
 * create during SSR: every browser API is touched only when it exists.
 */
import { Chat } from '@ai-sdk/svelte';
import { DefaultChatTransport, type UIMessage } from 'ai';
import {
	DEFAULT_CLIENT_LIMITS,
	DEFAULT_ENDPOINT,
	currentPath,
	dispatch,
	errorFor,
	fetchWarmup,
	mergeStrings,
	messageText,
	pickSuggestions,
	refusalCapture,
	requestBody,
	restoreThread,
	saveThread,
	sessionIdForTab,
	usageOf,
	type AnswerLinks,
	type ChatError,
	type ChatOptions,
	type ChatStatus,
	type ClientLimits,
	type Strings,
	type WarmupResponse
} from '@chat-aide/core/client';

export {
	messageText,
	trimForRequest,
	type AnswerLinks,
	type ChatError,
	type ChatOptions,
	type ChatStatus,
	type ClientLimits,
	type WidgetMode,
	type WidgetPosition
} from '@chat-aide/core/client';

export interface ChatStore {
	readonly messages: UIMessage[];
	readonly status: ChatStatus;
	readonly error: ChatError | null;
	readonly isOpen: boolean;
	/** Up to four suggestions for the current route. */
	readonly suggestions: string[];
	readonly strings: Strings;
	readonly route: string;
	/** The provider's name from the warm-up, or `null` before one answered. */
	readonly provider: string | null;
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

export function createChat(options: ChatOptions = {}): ChatStore {
	const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
	const persist = options.persistThread ?? true;
	const answerLinks: AnswerLinks = options.answerLinks ?? 'same-origin';
	const strings = mergeStrings(options.strings);
	const baseFetch: typeof fetch = (...args) => (options.fetch ?? globalThis.fetch)(...args);
	const sessionId = sessionIdForTab();

	let isOpen = $state(false);
	let route = $state(currentPath());
	let pageSource: WarmupResponse['pageSource'] = 'server';
	let serverSuggestions = $state<string[]>([]);
	let provider = $state<string | null>(null);
	let limits: ClientLimits = DEFAULT_CLIENT_LIMITS;
	let error = $state<ChatError | null>(null);
	/** Keeps the refusal body of the last non-2xx POST before the SDK throws. */
	const capture = refusalCapture(baseFetch);

	const save = (messages: UIMessage[]): void => {
		if (persist) saveThread(messages);
	};

	const fail = (next: ChatError): void => {
		error = next;
		options.onerror?.(next.code);
		dispatch('aide:error', { code: next.code });
	};

	const chat = new Chat<UIMessage>({
		messages: persist ? restoreThread() : [],
		transport: new DefaultChatTransport<UIMessage>({
			api: endpoint,
			fetch: capture.fetch,
			prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => {
				const path = currentPath();
				route = path;
				return {
					body: requestBody(
						{ id, messages, trigger, messageId },
						{ route: path, sessionId, limits, sendDom: pageSource === 'dom' }
					)
				};
			}
		}),
		onError: () => fail(errorFor(capture.last(), strings, options.strings)),
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
		const result = await fetchWarmup(endpoint, path, baseFetch);
		if (!result || route !== path) return; // failed, or a newer navigation won
		pageSource = result.pageSource;
		serverSuggestions = result.suggestions;
		if (result.provider) provider = result.provider;
		limits = result.limits ?? limits;
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
			return pickSuggestions(options.suggestions, route, serverSuggestions);
		},
		get strings() {
			return strings;
		},
		get route() {
			return route;
		},
		get provider() {
			return provider;
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
