// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { createChat, type ChatStore } from '../../../src/lib/headless/create-chat.svelte';

interface Call {
	url: string;
	init: RequestInit | undefined;
}

function streamResponse(text: string, usage?: Record<string, number>): Response {
	return createUIMessageStreamResponse({
		stream: createUIMessageStream({
			execute({ writer }) {
				writer.write({ type: 'start', ...(usage ? { messageMetadata: { usage } } : {}) });
				writer.write({ type: 'text-start', id: 't1' });
				writer.write({ type: 'text-delta', id: 't1', delta: text });
				writer.write({ type: 'text-end', id: 't1' });
			}
		})
	});
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

/** A fake fetch: GET answers the warm-up, POST answers with `post()`. */
function fakeFetch(opts: {
	warmup?: unknown;
	post?: () => Response;
}): { fetch: typeof fetch; calls: Call[] } {
	const calls: Call[] = [];
	const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		calls.push({ url, init });
		if ((init?.method ?? 'GET') === 'GET') {
			return json(opts.warmup ?? { pageSource: 'server', suggestions: [], mapped: true });
		}
		return (opts.post ?? (() => streamResponse('Hello there')))();
	}) as typeof fetch;
	return { fetch: fn, calls };
}

interface PostBody {
	aide: { route: string; sessionId: string; dom: string | null };
	messages: { role: string; parts: { type: string; text?: string }[] }[];
}

function postBody(calls: Call[], n = 0): PostBody {
	const posts = calls.filter((c) => c.init?.method === 'POST');
	return JSON.parse(String(posts[n]!.init!.body));
}

async function settle(store: ChatStore): Promise<void> {
	for (let i = 0; i < 50 && (store.status === 'submitted' || store.status === 'streaming'); i++) {
		await new Promise((r) => setTimeout(r, 5));
	}
}

beforeEach(() => {
	sessionStorage.clear();
	history.replaceState(null, '', '/privacy');
	document.body.innerHTML =
		'<nav>Menu</nav><main><h1>Privacy</h1><p>We keep nothing about you.</p></main>';
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('createChat', () => {
	it('posts messages with aide.route, sessionId and dom: null by default', async () => {
		const f = fakeFetch({});
		const chat = createChat({ fetch: f.fetch, endpoint: '/api/chat' });
		await chat.send('What do you store?');
		await settle(chat);

		const posts = f.calls.filter((c) => c.init?.method === 'POST');
		expect(posts).toHaveLength(1);
		expect(posts[0]!.url).toBe('/api/chat');
		const body = postBody(f.calls);
		expect(body.aide.route).toBe('/privacy');
		expect(body.aide.sessionId).toBe(chat.sessionId);
		expect(body.aide.dom).toBeNull();
		expect(body.messages.at(-1)!.role).toBe('user');
		expect(body.messages.at(-1)!.parts[0]).toMatchObject({ type: 'text', text: 'What do you store?' });

		expect(chat.status).toBe('ready');
		expect(chat.messages).toHaveLength(2);
		expect(chat.messages[1]!.role).toBe('assistant');
	});

	it('mints one sessionId per tab in sessionStorage', () => {
		const a = createChat({ fetch: fakeFetch({}).fetch });
		expect(a.sessionId).toMatch(/[0-9a-f-]{36}/);
		expect(sessionStorage.getItem('aide:session')).toBe(a.sessionId);
		const b = createChat({ fetch: fakeFetch({}).fetch });
		expect(b.sessionId).toBe(a.sessionId);
	});

	it('sends DOM text after a warm-up returned pageSource "dom"', async () => {
		const f = fakeFetch({ warmup: { pageSource: 'dom', suggestions: ['Q?'], mapped: false } });
		const chat = createChat({ fetch: f.fetch });
		await chat.warmup('/privacy');
		const get = f.calls.find((c) => (c.init?.method ?? 'GET') === 'GET')!;
		expect(get.url).toBe('/api/chat?route=%2Fprivacy');
		expect(chat.route).toBe('/privacy');
		expect(chat.suggestions).toEqual(['Q?']);

		await chat.send('hi');
		await settle(chat);
		const dom = postBody(f.calls).aide.dom as string;
		expect(dom).toContain('We keep nothing about you.');
		expect(dom).not.toContain('Menu');
	});

	it('caps DOM text at 12 000 characters', async () => {
		document.body.innerHTML = `<main><p>${'x'.repeat(20_000)}</p></main>`;
		const f = fakeFetch({ warmup: { pageSource: 'dom', suggestions: [], mapped: true } });
		const chat = createChat({ fetch: f.fetch });
		await chat.warmup('/privacy');
		await chat.send('hi');
		await settle(chat);
		expect((postBody(f.calls).aide.dom as string).length).toBe(12_000);
	});

	it('turns a 429 refusal into error.code "rate_limited" and calls onerror', async () => {
		const onerror = vi.fn();
		const events: string[] = [];
		const listener = (e: Event) => events.push((e as CustomEvent).detail.code);
		window.addEventListener('aide:error', listener);
		const f = fakeFetch({
			post: () => json({ error: 'rate_limited', message: 'Slow down please.' }, 429)
		});
		const chat = createChat({ fetch: f.fetch, onerror });
		await chat.send('hi');
		await settle(chat);
		window.removeEventListener('aide:error', listener);

		expect(chat.status).toBe('error');
		expect(chat.error).toEqual({ code: 'rate_limited', message: 'Slow down please.' });
		expect(onerror).toHaveBeenCalledWith('rate_limited');
		expect(events).toEqual(['rate_limited']);
	});

	it('reports a network failure as code "network"', async () => {
		const failing = (async (_i: RequestInfo | URL, init?: RequestInit) => {
			if (init?.method === 'POST') throw new TypeError('Failed to fetch');
			return json({ pageSource: 'server', suggestions: [], mapped: true });
		}) as typeof fetch;
		const chat = createChat({ fetch: failing });
		await chat.send('hi');
		await settle(chat);
		expect(chat.error?.code).toBe('network');
		expect(chat.error?.message).toBe(chat.strings.errors.network);
	});

	it('retry resends the last user message and clears the error', async () => {
		let n = 0;
		const f = fakeFetch({
			post: () =>
				n++ === 0
					? json({ error: 'provider_error', message: 'Try again.' }, 502)
					: streamResponse('Second time lucky')
		});
		const chat = createChat({ fetch: f.fetch });
		await chat.send('hello?');
		await settle(chat);
		expect(chat.error?.code).toBe('provider_error');
		await chat.retry();
		await settle(chat);
		expect(chat.error).toBeNull();
		expect(chat.status).toBe('ready');
		const body = postBody(f.calls, 1);
		expect(body.messages).toHaveLength(1);
		expect(body.messages[0]!.parts[0]!.text).toBe('hello?');
		expect(chat.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
	});

	it('persists the thread to sessionStorage and a new store restores it', async () => {
		const chat = createChat({ fetch: fakeFetch({}).fetch });
		await chat.send('remember me');
		await settle(chat);
		const saved = JSON.parse(sessionStorage.getItem('aide:thread') ?? '[]');
		expect(saved).toHaveLength(2);

		const again = createChat({ fetch: fakeFetch({}).fetch });
		expect(again.messages).toHaveLength(2);
		expect(again.messages[0]!.parts[0]).toMatchObject({ type: 'text', text: 'remember me' });
	});

	it('persistThread: false writes no thread', async () => {
		const chat = createChat({ fetch: fakeFetch({}).fetch, persistThread: false });
		await chat.send('forget me');
		await settle(chat);
		expect(sessionStorage.getItem('aide:thread')).toBeNull();
	});

	it('survives a sessionStorage that throws', async () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		const chat = createChat({ fetch: fakeFetch({}).fetch });
		expect(chat.sessionId).toBeTruthy();
		await chat.send('hi');
		await settle(chat);
		expect(chat.status).toBe('ready');
	});

	it('calls the client callbacks and dispatches aide:* CustomEvents', async () => {
		const seen: { type: string; detail: unknown }[] = [];
		const types = ['aide:open', 'aide:close', 'aide:send', 'aide:response', 'aide:error'];
		const listener = (e: Event) => seen.push({ type: e.type, detail: (e as CustomEvent).detail });
		for (const t of types) window.addEventListener(t, listener);

		const onopen = vi.fn();
		const onclose = vi.fn();
		const onsend = vi.fn();
		const onresponse = vi.fn();
		const f = fakeFetch({ post: () => streamResponse('Answer', { inputTokens: 5, outputTokens: 2 }) });
		const chat = createChat({ fetch: f.fetch, onopen, onclose, onsend, onresponse });

		chat.open();
		expect(chat.isOpen).toBe(true);
		await chat.send('Question');
		await settle(chat);
		chat.close();
		expect(chat.isOpen).toBe(false);
		chat.toggle();
		expect(chat.isOpen).toBe(true);
		for (const t of types) window.removeEventListener(t, listener);

		expect(onopen).toHaveBeenCalledTimes(2);
		expect(onclose).toHaveBeenCalledTimes(1);
		expect(onsend).toHaveBeenCalledWith('Question');
		expect(onresponse).toHaveBeenCalledWith('Answer', { inputTokens: 5, outputTokens: 2 });
		expect(seen.map((s) => s.type)).toEqual([
			'aide:open',
			'aide:send',
			'aide:response',
			'aide:close',
			'aide:open'
		]);
		expect(seen[1]!.detail).toEqual({ text: 'Question' });
		expect(seen[2]!.detail).toEqual({ text: 'Answer', usage: { inputTokens: 5, outputTokens: 2 } });
	});

	it('open() warms up the current route', async () => {
		const f = fakeFetch({ warmup: { pageSource: 'server', suggestions: ['A', 'B'], mapped: true } });
		const chat = createChat({ fetch: f.fetch });
		chat.open();
		await vi.waitFor(() => expect(chat.suggestions).toEqual(['A', 'B']));
		expect(f.calls[0]!.url).toBe('/api/chat?route=%2Fprivacy');
	});

	it('resolves suggestions from a route map, preferring options over the server', async () => {
		const f = fakeFetch({ warmup: { pageSource: 'server', suggestions: ['server'], mapped: true } });
		const chat = createChat({
			fetch: f.fetch,
			suggestions: { '/privacy': ['What do you store?', 'Cookies?'], '/': ['Home?'] }
		});
		expect(chat.suggestions).toEqual(['What do you store?', 'Cookies?']);
		await chat.warmup('/');
		expect(chat.suggestions).toEqual(['Home?']);
		await chat.warmup('/unknown');
		expect(chat.suggestions).toEqual(['server']);

		const list = createChat({ fetch: f.fetch, suggestions: ['a', 'b', 'c', 'd', 'e'] });
		expect(list.suggestions).toEqual(['a', 'b', 'c', 'd']);
	});

	it('merges strings and keeps answerLinks', () => {
		const chat = createChat({
			fetch: fakeFetch({}).fetch,
			strings: { send: 'Senden' },
			answerLinks: 'any'
		});
		expect(chat.strings.send).toBe('Senden');
		expect(chat.strings.stop).toBe('Stop');
		expect(chat.answerLinks).toBe('any');
		expect(createChat({ fetch: fakeFetch({}).fetch }).answerLinks).toBe('same-origin');
	});

	it('ignores empty messages and sends nothing while busy', async () => {
		const f = fakeFetch({});
		const chat = createChat({ fetch: f.fetch });
		await chat.send('   ');
		expect(f.calls.filter((c) => c.init?.method === 'POST')).toHaveLength(0);
	});
});
