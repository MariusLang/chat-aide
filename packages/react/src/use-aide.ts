'use client';
/**
 * `useAide(options)`: the chat state for a React widget. The same behaviour as the Svelte store
 * (`svelte-chat-aide/headless`'s `createChat`): the per-tab session and thread, the warm-up, the
 * `aide` request block, the refusal codes, the callbacks and the `aide:*` window events, all from
 * `@chat-aide/core/client`, over `@ai-sdk/react`'s `useChat`.
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
	const persist = options.persistThread ?? true;
	const answerLinks: AnswerLinks = options.answerLinks ?? 'same-origin';
	const strings = useMemo(() => mergeStrings(options.strings), [options.strings]);
	const stringsRef = useRef(strings);
	stringsRef.current = strings;

	const [sessionId] = useState(sessionIdForTab);
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
								sessionId,
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

	// The thread and the route are the browser's: restored after hydration, never during SSR.
	useEffect(() => {
		live.current.route = currentPath();
		setRoute(live.current.route);
		if (persist) {
			const kept = restoreThread();
			if (kept.length) helpers.setMessages(kept);
		}
		// Once, on mount.
	}, []);

	const busy = helpers.status === 'submitted' || helpers.status === 'streaming';
	const busyRef = useRef(busy);
	busyRef.current = busy;

	const send = useCallback(
		async (text: string) => {
			const value = text.trim();
			if (!value || busyRef.current) return;
			setError(null);
			chat.clearError();
			opts.current.onsend?.(value);
			dispatch('aide:send', { text: value });
			await chat.sendMessage({ text: value });
			if (opts.current.persistThread ?? true) saveThread(chat.messages);
		},
		[chat]
	);

	const retry = useCallback(async () => {
		if (busyRef.current || !chat.messages.some((m) => m.role === 'user')) return;
		setError(null);
		chat.clearError();
		// Drop everything after the last user message, then ask again.
		let messages = chat.messages;
		while (messages.length && messages.at(-1)!.role !== 'user') messages = messages.slice(0, -1);
		chat.messages = messages;
		await chat.regenerate();
		if (opts.current.persistThread ?? true) saveThread(chat.messages);
	}, [chat]);

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
		setOpen(true);
		opts.current.onopen?.();
		dispatch('aide:open', {});
		void warmup(currentPath());
	}, [warmup]);

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
		messages: helpers.messages,
		status: helpers.status as ChatStatus,
		error,
		isOpen,
		suggestions: pickSuggestions(options.suggestions, route, serverSuggestions),
		strings,
		route,
		provider,
		answerLinks,
		sessionId,
		send,
		stop,
		retry,
		open,
		close,
		toggle,
		warmup
	};
}
