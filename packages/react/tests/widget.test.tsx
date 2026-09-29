import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatWidget } from '../src/index.js';

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
