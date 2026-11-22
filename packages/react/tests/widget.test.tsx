import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatWidget, ChatWindow, useAide } from '../src/index.js';

interface Call {
	url: string;
	init: RequestInit | undefined;
}

function streamResponse(text: string): Response {
	return createUIMessageStreamResponse({
		stream: createUIMessageStream({
			execute({ writer }) {
				writer.write({ type: 'start' });
				writer.write({ type: 'text-start', id: 't1' });
				writer.write({ type: 'text-delta', id: 't1', delta: text });
				writer.write({ type: 'text-end', id: 't1' });
			}
		})
	});
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function fakeFetch(opts: { warmup?: unknown; post?: () => Response } = {}): { fetch: typeof fetch; calls: Call[] } {
	const calls: Call[] = [];
	const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		calls.push({ url, init });
		if ((init?.method ?? 'GET') === 'GET') {
			return json(opts.warmup ?? { pageSource: 'server', suggestions: ['What is this?'], mapped: true, provider: 'Anthropic' });
		}
		return (opts.post ?? (() => streamResponse('See [pricing](/pricing) and **more**.')))();
	}) as typeof fetch;
	return { fetch: fn, calls };
}

beforeEach(() => {
	sessionStorage.clear();
	history.replaceState(null, '', '/docs/install');
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('ChatWidget (React)', () => {
	it('renders the headless structure inside the plain theme root', () => {
		const { container } = render(<ChatWidget fetch={fakeFetch().fetch} />);
		expect(container.querySelector('[data-aide-theme="plain"] [data-part="widget"]')).not.toBeNull();
		expect(container.querySelector('[data-part="launcher"]')?.getAttribute('aria-expanded')).toBe('false');
	});

	it('warms up the current route on open and shows the server suggestions and provider', async () => {
		const f = fakeFetch();
		render(<ChatWidget fetch={f.fetch} />);
		fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
		await screen.findByRole('button', { name: 'What is this?' });
		expect(f.calls[0]!.url).toBe('/api/chat?route=%2Fdocs%2Finstall');
		expect(screen.getByRole('dialog').querySelector('[data-part="disclosure"]')?.textContent).toContain('Anthropic');
	});

	it('posts the aide block and renders the answer as safe markdown', async () => {
		const f = fakeFetch();
		const onresponse = vi.fn();
		render(<ChatWidget fetch={f.fetch} onresponse={onresponse} />);
		fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
		fireEvent.click(await screen.findByRole('button', { name: 'What is this?' }));
		await waitFor(() => expect(onresponse).toHaveBeenCalled());
		const post = f.calls.find((c) => c.init?.method === 'POST')!;
		const body = JSON.parse(String(post.init!.body));
		expect(body.aide).toMatchObject({ route: '/docs/install', dom: null });
		expect(typeof body.aide.sessionId).toBe('string');
		expect(body.messages.at(-1).parts[0].text).toBe('What is this?');
		const link = await screen.findByRole('link', { name: 'pricing' });
		expect(link.getAttribute('href')).toBe('/pricing');
		expect(document.querySelector('[data-part="markdown"] strong')?.textContent).toBe('more');
	});

	it('uses navigate for same-origin answer links', async () => {
		const navigate = vi.fn();
		render(<ChatWidget fetch={fakeFetch().fetch} navigate={navigate} />);
		fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
		fireEvent.click(await screen.findByRole('button', { name: 'What is this?' }));
		fireEvent.click(await screen.findByRole('link', { name: 'pricing' }));
		expect(navigate).toHaveBeenCalledWith('/pricing');
	});

	it('shows a refusal by its code, with a retry', async () => {
		const f = fakeFetch({ post: () => json({ error: 'rate_limited', message: 'Slow down.' }, 429) });
		const onerror = vi.fn();
		render(<ChatWidget fetch={f.fetch} onerror={onerror} />);
		fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
		fireEvent.click(await screen.findByRole('button', { name: 'What is this?' }));
		const alert = await screen.findByRole('alert');
		expect(alert.getAttribute('data-code')).toBe('rate_limited');
		expect(alert.textContent).toContain('Slow down.');
		expect(onerror).toHaveBeenCalledWith('rate_limited');
	});

	it('keeps focus inside the dialog after a suggestion, so Escape still closes it', async () => {
		render(<ChatWidget fetch={fakeFetch().fetch} />);
		fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
		const suggestion = await screen.findByRole('button', { name: 'What is this?' });
		suggestion.focus();
		fireEvent.click(suggestion);
		await screen.findByRole('link', { name: 'pricing' });
		const dialog = screen.getByRole('dialog');
		expect(document.activeElement?.getAttribute('data-part')).toBe('input');
		expect(dialog.contains(document.activeElement)).toBe(true);
		act(() => {
			fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
		});
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	});

	it('keeps focus inside the dialog after a retry', async () => {
		const f = fakeFetch({ post: () => json({ error: 'rate_limited', message: 'Slow down.' }, 429) });
		render(<ChatWidget fetch={f.fetch} />);
		fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
		fireEvent.click(await screen.findByRole('button', { name: 'What is this?' }));
		const retry = await screen.findByRole('button', { name: 'Retry' });
		retry.focus();
		fireEvent.click(retry);
		expect(document.activeElement?.getAttribute('data-part')).toBe('input');
	});

	it('keeps the thread for the tab and restores it after a remount', async () => {
		const f = fakeFetch();
		const first = render(<ChatWidget fetch={f.fetch} />);
		fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
		fireEvent.click(await screen.findByRole('button', { name: 'What is this?' }));
		await screen.findByRole('link', { name: 'pricing' });
		first.unmount();
		render(<ChatWidget fetch={f.fetch} />);
		fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
		expect(await screen.findByRole('link', { name: 'pricing' })).not.toBeNull();
	});

	it('closes on Escape and follows a controlled open prop', async () => {
		const onOpenChange = vi.fn();
		const { rerender } = render(<ChatWidget fetch={fakeFetch().fetch} open={false} onOpenChange={onOpenChange} />);
		rerender(<ChatWidget fetch={fakeFetch().fetch} open onOpenChange={onOpenChange} />);
		const dialog = await screen.findByRole('dialog');
		await waitFor(() => expect(onOpenChange).toHaveBeenLastCalledWith(true));
		act(() => {
			fireEvent.keyDown(dialog, { key: 'Escape' });
		});
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(onOpenChange).toHaveBeenLastCalledWith(false);
	});

	it('renders nothing when disabled', () => {
		const { container } = render(<ChatWidget enabled={false} />);
		expect(container.innerHTML).toBe('');
	});
});

describe('ChatWidget with an external chat', () => {
	it('opens a chat swapped in through the chat prop', async () => {
		function Host({ which }: { which: 'a' | 'b' }) {
			const a = useAide({ fetch: fakeFetch().fetch });
			const b = useAide({ fetch: fakeFetch().fetch, strings: { title: 'Second chat' } });
			return <ChatWidget chat={which === 'a' ? a : b} open />;
		}
		const { rerender } = render(<Host which="a" />);
		await screen.findByRole('dialog');
		rerender(<Host which="b" />);
		expect(await screen.findByRole('heading', { name: 'Second chat' })).not.toBeNull();
	});
});

describe('storage and the network wait for the first use (React)', () => {
	const THREAD = [
		{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'remember me' }] },
		{ id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'I do.' }] }
	];
	/** Every read and write of `sessionStorage` from here on. */
	const watchStorage = () => ({
		reads: vi.spyOn(sessionStorage, 'getItem'),
		writes: vi.spyOn(sessionStorage, 'setItem')
	});
	const messages = () => [...document.querySelectorAll('[data-part="message"]')].map((m) => m.textContent?.trim());
	const posts = (calls: Call[]) => calls.filter((c) => c.init?.method === 'POST');
	const sessionOf = (call: Call): string => JSON.parse(String(call.init!.body)).aide.sessionId;
	const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

	beforeEach(() => {
		sessionStorage.setItem('aide:thread', JSON.stringify(THREAD));
	});

	it('enabled={false} touches no storage and sends nothing', async () => {
		const storage = watchStorage();
		const f = fakeFetch();
		const { container } = render(<ChatWidget enabled={false} open fetch={f.fetch} />);
		await settle();

		expect(container.innerHTML).toBe('');
		expect(storage.reads).not.toHaveBeenCalled();
		expect(storage.writes).not.toHaveBeenCalled();
		expect(sessionStorage.getItem('aide:session')).toBeNull();
		expect(f.calls).toHaveLength(0);
	});

	it('default props touch no storage and send nothing until the chat is opened', async () => {
		const storage = watchStorage();
		const f = fakeFetch();
		render(<ChatWidget fetch={f.fetch} />);
		await settle();

		expect(storage.reads).not.toHaveBeenCalled();
		expect(storage.writes).not.toHaveBeenCalled();
		expect(f.calls).toHaveLength(0);

		fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
		await waitFor(() => expect(messages()).toEqual(['remember me', 'I do.']));
		expect(sessionStorage.getItem('aide:session')).toMatch(/[0-9a-f-]{36}/);
		expect(f.calls.map((c) => c.url)).toEqual(['/api/chat?route=%2Fdocs%2Finstall']);
	});

	it('an initially open widget has its id, its thread and its warm-up', async () => {
		const f = fakeFetch();
		render(<ChatWidget open fetch={f.fetch} />);
		await waitFor(() => expect(messages()).toEqual(['remember me', 'I do.']));
		expect(sessionStorage.getItem('aide:session')).toMatch(/[0-9a-f-]{36}/);
		expect(f.calls.map((c) => c.url)).toEqual(['/api/chat?route=%2Fdocs%2Finstall']);
	});

	it('reuses the id of the tab and sends it with every message', async () => {
		sessionStorage.removeItem('aide:thread');
		sessionStorage.setItem('aide:session', 'kept-for-the-tab');
		const f = fakeFetch({ post: () => streamResponse('Fine.') });
		render(<ChatWidget fetch={f.fetch} />);
		fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
		fireEvent.click(await screen.findByRole('button', { name: 'What is this?' }));
		await waitFor(() => expect(messages()).toHaveLength(2));
		await screen.findByRole('button', { name: 'Send' });

		const input = document.querySelector('[data-part="input"]') as HTMLTextAreaElement;
		fireEvent.change(input, { target: { value: 'Second?' } });
		fireEvent.keyDown(input, { key: 'Enter' });
		await waitFor(() => expect(messages()).toHaveLength(4));

		expect(posts(f.calls).map(sessionOf)).toEqual(['kept-for-the-tab', 'kept-for-the-tab']);
		expect(sessionStorage.getItem('aide:session')).toBe('kept-for-the-tab');
	});

	it('mints the id with the first message when nothing opened the chat', async () => {
		sessionStorage.removeItem('aide:thread');
		const storage = watchStorage();
		const f = fakeFetch({ post: () => streamResponse('Fine.') });
		function Bare() {
			const chat = useAide({ fetch: f.fetch });
			return (
				<button type="button" onClick={() => void chat.send('hello')}>
					ask
				</button>
			);
		}
		render(<Bare />);
		await settle();
		expect(storage.reads).not.toHaveBeenCalled();
		expect(storage.writes).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole('button', { name: 'ask' }));
		await waitFor(() => expect(posts(f.calls)).toHaveLength(1));
		expect(sessionOf(posts(f.calls)[0]!)).toMatch(/[0-9a-f-]{36}/);
		expect(sessionOf(posts(f.calls)[0]!)).toBe(sessionStorage.getItem('aide:session'));
	});

	it('persistThread={false} never reads or writes the thread', async () => {
		const storage = watchStorage();
		const f = fakeFetch({ post: () => streamResponse('Fine.') });
		render(<ChatWidget persistThread={false} fetch={f.fetch} />);
		fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
		fireEvent.click(await screen.findByRole('button', { name: 'What is this?' }));
		await waitFor(() => expect(messages()).toEqual(['What is this?', 'Fine.']));
		await screen.findByRole('button', { name: 'Send' });

		expect(storage.reads).not.toHaveBeenCalledWith('aide:thread');
		expect(storage.writes).not.toHaveBeenCalledWith('aide:thread', expect.anything());
		expect(sessionOf(posts(f.calls)[0]!)).toBe(sessionStorage.getItem('aide:session'));
	});

	it('inline mode shows the kept thread and writes no id before the first message', async () => {
		const storage = watchStorage();
		render(<ChatWidget mode="inline" fetch={fakeFetch().fetch} />);
		await waitFor(() => expect(messages()).toEqual(['remember me', 'I do.']));
		expect(storage.writes).not.toHaveBeenCalled();
		expect(sessionStorage.getItem('aide:session')).toBeNull();
	});

	it('a window over useAide shows the kept thread without being opened', async () => {
		function DocsChat() {
			const chat = useAide({ fetch: fakeFetch().fetch });
			return <ChatWindow chat={chat} modal={false} />;
		}
		render(<DocsChat />);
		await waitFor(() => expect(messages()).toEqual(['remember me', 'I do.']));
		expect(sessionStorage.getItem('aide:session')).toBeNull();
	});

	it('a chat passed as chat= is left alone while enabled is false', async () => {
		const storage = watchStorage();
		const f = fakeFetch();
		function Host() {
			const chat = useAide({ fetch: f.fetch });
			return <ChatWidget chat={chat} enabled={false} open />;
		}
		render(<Host />);
		await settle();

		expect(storage.reads).not.toHaveBeenCalled();
		expect(storage.writes).not.toHaveBeenCalled();
		expect(f.calls).toHaveLength(0);
	});

	it('sessionId is the id of the tab once read', async () => {
		let seen = '';
		function Reader() {
			seen = useAide({ fetch: fakeFetch().fetch }).sessionId;
			return null;
		}
		render(<Reader />);
		expect(seen).toMatch(/[0-9a-f-]{36}/);
		expect(sessionStorage.getItem('aide:session')).toBe(seen);
	});
});
