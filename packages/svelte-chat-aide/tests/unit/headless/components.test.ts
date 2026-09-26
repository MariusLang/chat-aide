import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { createRawSnippet } from 'svelte';
import { parseHTML } from 'linkedom';
import { extract } from '../../../src/lib/site/extract';
import {
	ChatWidget,
	ChatWindow,
	Markdown,
	createChat,
	type ChatStore
} from '../../../src/lib/headless/index';

const LIB = fileURLToPath(new URL('../../../src/lib', import.meta.url));

function files(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? files(path) : [path];
	});
}

function storeWith(messages: unknown[]): ChatStore {
	const base = createChat({ fetch: (async () => new Response('{}')) as typeof fetch });
	return new Proxy(base, {
		get(target, key, receiver) {
			if (key === 'messages') return messages;
			return Reflect.get(target, key, receiver);
		}
	});
}

describe('ChatWidget (server render)', () => {
	it('renders a labelled launcher and no image', () => {
		const { body } = render(ChatWidget, { props: {} });
		expect(body).toContain('data-part="launcher"');
		expect(body).toMatch(/aria-label="Open chat"/);
		expect(body).toMatch(/aria-expanded="false"/);
		expect(body).toMatch(/aria-controls="aide-window-[^"]+"/);
		expect(body).toContain('data-position="bottom-right"');
		expect(body).not.toContain('<img');
		expect(body).not.toContain('data-part="window"');
	});

	it('renders nothing while enabled is false', () => {
		const { body } = render(ChatWidget, { props: { enabled: false } });
		expect(body).not.toContain('data-part');
	});

	it('replaces the launcher with the launcher snippet', () => {
		const launcher = createRawSnippet(() => ({
			render: () => '<button data-custom="yes">Help</button>'
		}));
		const { body } = render(ChatWidget, { props: { launcher } });
		expect(body).toContain('data-custom="yes"');
		expect(body).not.toContain('data-part="launcher"');
		expect(body).not.toContain('data-position=');
	});

	it('inline mode renders the window as a region without a launcher', () => {
		const { body } = render(ChatWidget, {
			props: { mode: 'inline', strings: { greeting: 'Hallo!' }, suggestions: ['First?'] }
		});
		expect(body).toContain('data-part="window"');
		expect(body).toContain('role="region"');
		expect(body).not.toContain('data-part="launcher"');
		expect(body).toContain('data-part="transcript"');
		expect(body).toContain('aria-live="polite"');
		expect(body).toContain('Hallo!');
		expect(body).toContain('data-part="suggestion"');
		expect(body).toContain('data-part="composer"');
		expect(body).toContain('data-part="input"');
		expect(body).toContain('data-part="send"');
		expect(body).toContain('data-part="disclosure"');
	});

	it('uses the disclosure prop', () => {
		const { body } = render(ChatWidget, {
			props: { mode: 'inline', disclosure: 'Sent to Example AI.' }
		});
		expect(body).toContain('Sent to Example AI.');
	});
});

describe('ChatWindow (server render)', () => {
	it('is a modal dialog labelled by its title', () => {
		const chat = createChat({ fetch: (async () => new Response('{}')) as typeof fetch });
		const { body } = render(ChatWindow, { props: { chat } });
		expect(body).toContain('role="dialog"');
		expect(body).toContain('aria-modal="true"');
		const labelled = body.match(/aria-labelledby="([^"]+)"/)?.[1];
		expect(labelled).toBeTruthy();
		expect(body).toContain(`id="${labelled}"`);
		expect(body).toContain('data-part="header"');
		expect(body).toContain('data-part="title"');
		expect(body).toContain('data-part="close"');
		expect(body).toContain('data-part="status"');
	});

	it('renders user text as text and answers as safe markdown', () => {
		const chat = storeWith([
			{ id: 'u1', role: 'user', parts: [{ type: 'text', text: '<b>hi</b>' }] },
			{
				id: 'a1',
				role: 'assistant',
				parts: [
					{
						type: 'text',
						text: 'See [Privacy](/privacy) and ![x](https://evil.test/x.png) <img src=x onerror=alert(1)>\n\n```js\nlet a = 1;\n```'
					}
				]
			}
		]);
		const { body } = render(ChatWindow, { props: { chat } });
		expect(body).toContain('data-role="user"');
		expect(body).toContain('data-role="assistant"');
		expect(body).toContain('&lt;b>hi&lt;/b>');
		expect(body).toContain('data-part="markdown"');
		expect(body).toMatch(/<a data-part="link" href="\/privacy"/);
		expect(body).not.toContain('<img');
		expect(body).not.toContain('evil.test');
		expect(body).toContain('data-part="code"');
		expect(body).toContain('data-part="code-lang"');
		expect(body).toContain('data-part="copy"');
	});
});

describe('Markdown (server render)', () => {
	it('drops foreign links under same-origin and keeps them under any', () => {
		const md = '[Other](https://other.dev/x) and [js](javascript:alert(1))';
		const same = render(Markdown, { props: { text: md, origin: 'https://site.test' } }).body;
		expect(same).not.toContain('href=');
		expect(same).toContain('Other');
		const any = render(Markdown, {
			props: { text: md, origin: 'https://site.test', answerLinks: 'any' }
		}).body;
		expect(any).toContain('href="https://other.dev/x"');
		expect(any).toContain('target="_blank"');
		expect(any).toContain('rel="noopener noreferrer"');
		expect(any).not.toContain('javascript:');
	});

	it('turns SvelteKit preloading off on answer links (no credentialed load without a click)', () => {
		const { body } = render(Markdown, {
			props: { text: 'See [privacy](/privacy).', origin: 'https://site.test' }
		});
		expect(body).toContain('href="/privacy"');
		expect(body).toContain('data-sveltekit-preload-data="off"');
		expect(body).toContain('data-sveltekit-preload-code="off"');
	});

	it('renders nested lists and headings', () => {
		const { body } = render(Markdown, {
			props: { text: '## Title\n\n1. one\n   - inner\n2. two', origin: 'https://site.test' }
		});
		expect(body).toContain('<h2>');
		expect(body).toContain('<ol');
		expect(body).toContain('<ul>');
		expect(body).toContain('inner');
	});
});

describe('no raw HTML', () => {
	it('src/lib contains no {@html}', () => {
		const offenders = files(LIB).filter(
			(f) => /\.(svelte|ts|js)$/.test(f) && readFileSync(f, 'utf8').includes('{@html')
		);
		expect(offenders).toEqual([]);
	});
});

describe('the widget is never extracted as page text', () => {
	const thread = [
		{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'TRANSCRIPT-QUESTION' }] },
		{ id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'TRANSCRIPT-ANSWER' }] }
	];
	const pageText = (widget: string): string =>
		extract(
			parseHTML(`<html><body><h1>Pricing</h1><p>Plans start at five euros.</p>${widget}</body></html>`)
				.document as unknown as Document
		).text;

	it('inline ChatWidget', () => {
		const { body } = render(ChatWidget, {
			props: { mode: 'inline', chat: storeWith(thread), strings: { greeting: 'GREETING' } }
		});
		expect(body).toContain('TRANSCRIPT-QUESTION');
		const text = pageText(body);
		expect(text).toContain('Plans start at five euros.');
		expect(text).not.toMatch(/TRANSCRIPT|GREETING/);
	});

	it('standalone ChatWindow', () => {
		const { body } = render(ChatWindow, { props: { chat: storeWith(thread) } });
		expect(body).toContain('TRANSCRIPT-ANSWER');
		expect(pageText(body)).not.toContain('TRANSCRIPT');
	});
});
