'use client';
/**
 * `useAide(options)`: the chat state for a React widget. The same behaviour as the Svelte store
 * (`@chat-aide/sveltekit/headless`'s `createChat`): the per-tab session and thread, the warm-up, the
 * `aide` request block, the refusal codes, the callbacks and the `aide:*` window events, all from
 * `@chat-aide/core/client`, over `@ai-sdk/react`'s `useChat`.
 *
 * Calling the hook touches neither `sessionStorage` nor the network. The session id is minted and
 * the thread restored on first use: `open()`, `send()`, or a read of `sessionId` or `messages`.
 */
import { Chat, useChat } from '@ai-sdk/react';
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
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface AideChat {
	/** The thread; restored from the tab's storage on the first open or send, or after it is first read. */
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
	/** The tab's session id; minted and stored on the first open or send, or when first read. */
	readonly sessionId: string;
	send(text: string): Promise<void>;
	stop(): void;
	retry(): Promise<void>;
	open(): void;
	close(): void;
	toggle(): void;
	/** `GET endpoint?route=`; stores the page source and the server's suggestions. */
	warmup(route: string): Promise<void>;
}

export function useAide(options: ChatOptions = {}): AideChat {
	// Options are read through a ref, so callbacks and strings may change on any render.
	const opts = useRef(options);
	opts.current = options;

	const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
	const answerLinks: AnswerLinks = options.answerLinks ?? 'same-origin';
	const strings = useMemo(() => mergeStrings(options.strings), [options.strings]);
	const stringsRef = useRef(strings);
	stringsRef.current = strings;

	const [isOpen, setOpen] = useState(false);
	const [route, setRoute] = useState('/');
	const [serverSuggestions, setServerSuggestions] = useState<string[]>([]);
	const [provider, setProvider] = useState<string | null>(null);
	const [error, setError] = useState<ChatError | null>(null);
	const live = useRef<{ route: string; pageSource: WarmupResponse['pageSource']; limits: ClientLimits; open: boolean }>({
		route: '/',
		pageSource: 'server',
		limits: DEFAULT_CLIENT_LIMITS,
		open: false
	});
	const used = useRef({ sessionId: '', restored: false });

	/** The tab's session id, minted and stored the first time it is needed. */
	const session = useCallback(() => (used.current.sessionId ||= sessionIdForTab()), []);

	const baseFetch = useCallback<typeof fetch>((...args) => (opts.current.fetch ?? globalThis.fetch)(...args), []);

	const fail = useCallback((next: ChatError) => {
		setError(next);
		opts.current.onerror?.(next.code);
		dispatch('aide:error', { code: next.code });
	}, []);

	const [chat] = useState(() => {
		const capture = refusalCapture(baseFetch);
		return new Chat<UIMessage>({
			transport: new DefaultChatTransport<UIMessage>({
				api: endpoint,
				fetch: capture.fetch,
				prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => {
					const path = currentPath();
					live.current.route = path;
					setRoute(path);
					return {
						body: requestBody(
							{ id, messages, trigger, messageId },
							{
								route: path,
								sessionId: session(),
								limits: live.current.limits,
								sendDom: live.current.pageSource === 'dom'
							}
						)
					};
				}
			}),
			onError: () => fail(errorFor(capture.last(), stringsRef.current, opts.current.strings)),
			onFinish: ({ message, messages, isAbort, isDisconnect, isError }) => {
				if (opts.current.persistThread ?? true) saveThread(messages);
				if (isAbort || isDisconnect || isError || message.role !== 'assistant') return;
				const text = messageText(message);
				const usage = usageOf(message);
				opts.current.onresponse?.(text, usage);
				dispatch('aide:response', usage === undefined ? { text } : { text, usage });
			}
		});
	});
	const helpers = useChat({ chat });

	// The route is the browser's: read after hydration, never during SSR.
	useEffect(() => {
		live.current.route = currentPath();
		setRoute(live.current.route);
		// Once, on mount.
	}, []);

	/** Reads the thread kept for the tab, once. */
	const restore = useCallback(() => {
		if (used.current.restored) return;
		used.current.restored = true;
		if (!(opts.current.persistThread ?? true)) return;
		const kept = restoreThread();
		if (kept.length) chat.messages = kept;
	}, [chat]);

	/** First use by the visitor: from here on the tab has its id and its thread. */
	const start = useCallback(() => {
		session();
		restore();
	}, [session, restore]);

	const busy = helpers.status === 'submitted' || helpers.status === 'streaming';
	const busyRef = useRef(busy);
	busyRef.current = busy;

	const send = useCallback(
		async (text: string) => {
			const value = text.trim();
			if (!value || busyRef.current) return;
			start();
			setError(null);
			chat.clearError();
			opts.current.onsend?.(value);
			dispatch('aide:send', { text: value });
			await chat.sendMessage({ text: value });
			if (opts.current.persistThread ?? true) saveThread(chat.messages);
		},
		[chat, start]
	);

	const retry = useCallback(async () => {
		restore();
		if (busyRef.current || !chat.messages.some((m) => m.role === 'user')) return;
		setError(null);
		chat.clearError();
		// Drop everything after the last user message, then ask again.
		let messages = chat.messages;
		while (messages.length && messages.at(-1)!.role !== 'user') messages = messages.slice(0, -1);
		chat.messages = messages;
		await chat.regenerate();
		if (opts.current.persistThread ?? true) saveThread(chat.messages);
	}, [chat, restore]);

	const warmup = useCallback(
		async (path: string) => {
			live.current.route = path;
			setRoute(path);
			const result = await fetchWarmup(endpoint, path, baseFetch);
			if (!result || live.current.route !== path) return; // failed, or a newer navigation won
			live.current.pageSource = result.pageSource;
			live.current.limits = result.limits ?? live.current.limits;
			setServerSuggestions(result.suggestions);
			if (result.provider) setProvider(result.provider);
		},
		[endpoint, baseFetch]
	);

	const open = useCallback(() => {
		if (live.current.open) return;
		live.current.open = true;
		start();
		setOpen(true);
		opts.current.onopen?.();
		dispatch('aide:open', {});
		void warmup(currentPath());
	}, [warmup, start]);

	const close = useCallback(() => {
		if (!live.current.open) return;
		live.current.open = false;
		setOpen(false);
		opts.current.onclose?.();
		dispatch('aide:close', {});
	}, []);

	const toggle = useCallback(() => (live.current.open ? close() : open()), [open, close]);
	const stop = useCallback(() => void chat.stop(), [chat]);

	return {
		get messages() {
			// A render may not update the chat: the thread follows the first read of it.
			if (!used.current.restored && typeof window !== 'undefined') queueMicrotask(restore);
			return helpers.messages;
		},
		status: helpers.status as ChatStatus,
		error,
		isOpen,
		suggestions: pickSuggestions(options.suggestions, route, serverSuggestions),
		strings,
		route,
		provider,
		answerLinks,
		get sessionId() {
			return session();
		},
		send,
		stop,
		retry,
		open,
		close,
		toggle,
		warmup
	};
}
