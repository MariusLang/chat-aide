/**
 * The widget in a DOM: nothing is read from or written to `sessionStorage`, and nothing is sent,
 * before the chat is used. The session id and the thread come with the first open or send.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, type Component } from 'svelte';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { ChatWidget as Headless, createChat } from '../../../src/lib/headless/index';
import { ChatWidget as Plain } from '../../../src/lib/themes/plain/index';
import { ChatWidget as Shadcn } from '../../../src/lib/themes/shadcn/index';

const THEMES: [string, Component<Record<string, unknown>>][] = [
	['headless', Headless as Component<Record<string, unknown>>],
	['plain', Plain as Component<Record<string, unknown>>],
	['shadcn', Shadcn as Component<Record<string, unknown>>]
];

const THREAD = [
	{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'remember me' }] },
	{ id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'I do.' }] }
];

interface Call {
	url: string;
	init: RequestInit | undefined;
}

function fakeFetch(): { fetch: typeof fetch; calls: Call[] } {
	const calls: Call[] = [];
	const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		calls.push({ url, init });
		if ((init?.method ?? 'GET') === 'GET') {
			return new Response(JSON.stringify({ pageSource: 'server', suggestions: ['What is this?'], mapped: true }), {
				headers: { 'content-type': 'application/json' }
			});
		}
		return createUIMessageStreamResponse({
			stream: createUIMessageStream({
				execute({ writer }) {
					writer.write({ type: 'start' });
					writer.write({ type: 'text-start', id: 't1' });
					writer.write({ type: 'text-delta', id: 't1', delta: 'Hello there' });
					writer.write({ type: 'text-end', id: 't1' });
				}
			})
		});
	}) as typeof fetch;
	return { fetch: fn, calls };
}

/** Every read and write of `sessionStorage` from here on. */
function watchStorage() {
	return { reads: vi.spyOn(sessionStorage, 'getItem'), writes: vi.spyOn(sessionStorage, 'setItem') };
}

const part = (name: string) => document.querySelector<HTMLElement>(`[data-part="${name}"]`);
const messages = () => [...document.querySelectorAll('[data-part="message"]')].map((m) => m.textContent?.trim());
const posts = (calls: Call[]) => calls.filter((c) => c.init?.method === 'POST');
const sessionOf = (call: Call): string => JSON.parse(String(call.init!.body)).aide.sessionId;

async function settle(): Promise<void> {
	await new Promise((r) => setTimeout(r, 0));
	flushSync();
}

let mounted: Record<string, unknown>[] = [];

function show(widget: Component<Record<string, unknown>>, props: Record<string, unknown>): void {
	mounted.push(mount(widget, { target: document.body, props }));
	flushSync();
}

beforeEach(() => {
	sessionStorage.clear();
	history.replaceState(null, '', '/privacy');
	document.body.innerHTML = '';
});

afterEach(() => {
	for (const app of mounted) void unmount(app);
	mounted = [];
	vi.restoreAllMocks();
});

describe.each(THEMES)('ChatWidget before the chat is used (%s)', (_name, Widget) => {
	it('enabled={false} touches no storage and sends nothing', async () => {
		sessionStorage.setItem('aide:thread', JSON.stringify(THREAD));
		const storage = watchStorage();
		const f = fakeFetch();
		show(Widget, { enabled: false, open: true, fetch: f.fetch });
		await settle();

		expect(part('widget')).toBeNull();
		expect(storage.reads).not.toHaveBeenCalled();
		expect(storage.writes).not.toHaveBeenCalled();
		expect(sessionStorage.getItem('aide:session')).toBeNull();
		expect(f.calls).toHaveLength(0);
	});

	it('default props touch no storage and send nothing until the chat is opened', async () => {
		sessionStorage.setItem('aide:thread', JSON.stringify(THREAD));
		const storage = watchStorage();
		const f = fakeFetch();
		show(Widget, { fetch: f.fetch });
		await settle();

		expect(part('launcher')).not.toBeNull();
		expect(storage.reads).not.toHaveBeenCalled();
		expect(storage.writes).not.toHaveBeenCalled();
		expect(f.calls).toHaveLength(0);

		part('launcher')!.click();
		await settle();

		const id = sessionStorage.getItem('aide:session');
		expect(id).toMatch(/[0-9a-f-]{36}/);
		expect(messages()).toEqual(['remember me', 'I do.']);
		expect(f.calls.map((c) => c.url)).toEqual(['/api/chat?route=%2Fprivacy']);
	});

	it('an initially open widget has its id, its thread and its warm-up', async () => {
		sessionStorage.setItem('aide:thread', JSON.stringify(THREAD));
		const f = fakeFetch();
		show(Widget, { open: true, fetch: f.fetch });
		await settle();

		expect(sessionStorage.getItem('aide:session')).toMatch(/[0-9a-f-]{36}/);
		expect(messages()).toEqual(['remember me', 'I do.']);
		expect(f.calls.map((c) => c.url)).toEqual(['/api/chat?route=%2Fprivacy']);
	});

	it('reuses the id of the tab and sends it with every message', async () => {
		sessionStorage.setItem('aide:session', 'kept-for-the-tab');
		const f = fakeFetch();
		show(Widget, { fetch: f.fetch, suggestions: ['First?'] });
		part('launcher')!.click();
		await settle();
		part('suggestion')!.click();
		await vi.waitFor(() => expect(messages()).toHaveLength(2));
		await vi.waitFor(() => expect(part('send')).not.toBeNull());

		const input = part('input') as HTMLTextAreaElement;
		input.value = 'Second?';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
		await vi.waitFor(() => expect(messages()).toHaveLength(4));

		expect(posts(f.calls).map(sessionOf)).toEqual(['kept-for-the-tab', 'kept-for-the-tab']);
		expect(sessionStorage.getItem('aide:session')).toBe('kept-for-the-tab');
	});

	it('persistThread={false} never reads or writes the thread', async () => {
		sessionStorage.setItem('aide:thread', JSON.stringify(THREAD));
		const storage = watchStorage();
		const f = fakeFetch();
		show(Widget, { persistThread: false, fetch: f.fetch, suggestions: ['First?'] });
		part('launcher')!.click();
		await settle();
		expect(messages()).toEqual([]);
		part('suggestion')!.click();
		await vi.waitFor(() => expect(messages()).toHaveLength(2));

		expect(storage.reads).not.toHaveBeenCalledWith('aide:thread');
		expect(storage.writes).not.toHaveBeenCalledWith('aide:thread', expect.anything());
		expect(sessionOf(posts(f.calls)[0]!)).toBe(sessionStorage.getItem('aide:session'));
	});

	it('inline mode shows the kept thread and writes no id before the first message', async () => {
		sessionStorage.setItem('aide:thread', JSON.stringify(THREAD));
		const storage = watchStorage();
		show(Widget, { mode: 'inline', fetch: fakeFetch().fetch });
		await settle();

		expect(messages()).toEqual(['remember me', 'I do.']);
		expect(storage.writes).not.toHaveBeenCalled();
		expect(sessionStorage.getItem('aide:session')).toBeNull();
	});

	it('a store that is already open stays open when the widget mounts without an open prop', async () => {
		const f = fakeFetch();
		const onclose = vi.fn();
		const chat = createChat({ fetch: f.fetch, onclose });
		chat.open();
		show(Widget, { chat });
		await settle();

		expect(chat.isOpen).toBe(true);
		expect(onclose).not.toHaveBeenCalled();
	});

	it('open={false} still closes a store that is open', async () => {
		const chat = createChat({ fetch: fakeFetch().fetch });
		chat.open();
		show(Widget, { chat, open: false });
		await settle();

		expect(chat.isOpen).toBe(false);
	});

	it('a store passed as chat= is left alone while enabled is false', async () => {
		sessionStorage.setItem('aide:thread', JSON.stringify(THREAD));
		const storage = watchStorage();
		const f = fakeFetch();
		const chat = createChat({ fetch: f.fetch });
		show(Widget, { chat, enabled: false, open: true });
		await settle();

		expect(storage.reads).not.toHaveBeenCalled();
		expect(storage.writes).not.toHaveBeenCalled();
		expect(f.calls).toHaveLength(0);
	});
});
