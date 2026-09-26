import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { ChatWidget, ChatWindow, createChat } from '../../../src/lib/themes/plain/index';

const CSS = readFileSync(
	fileURLToPath(new URL('../../../src/lib/themes/plain/plain.css', import.meta.url)),
	'utf8'
);
const noFetch = (async () => new Response('{}')) as typeof fetch;

/** The CSS with comments removed, so assertions see only rules. */
const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

describe('plain theme: server render', () => {
	it('marks the root with data-aide-theme="plain" and keeps the headless structure', () => {
		const { body } = render(ChatWidget, { props: {} });
		expect(body).toContain('data-aide-theme="plain"');
		expect(body).toContain('data-part="widget"');
		expect(body).toContain('data-part="launcher"');
		expect(body).toContain('data-position="bottom-right"');
		expect(body).toContain('data-mode="floating"');
		expect(body).not.toContain('<img');
	});

	it('passes mode, position and data-theme through', () => {
		const { body } = render(ChatWidget, {
			props: { mode: 'inline', position: 'top-left', theme: 'dark' }
		});
		expect(body).toContain('data-mode="inline"');
		expect(body).toContain('data-position="top-left"');
		expect(body).toContain('data-theme="dark"');
		expect(body).toContain('data-part="window"');
	});

	it('renders nothing but the theme root while enabled is false', () => {
		const { body } = render(ChatWidget, { props: { enabled: false } });
		expect(body).not.toContain('data-part');
	});

	it('injects one <style> into the head carrying the nonce', () => {
		const { head } = render(ChatWidget, { props: { nonce: 'r4nd0m' } });
		expect(head.match(/<style/g)?.length).toBe(1);
		expect(head).toMatch(/<style[^>]*nonce="r4nd0m"/);
		expect(head).toContain('[data-aide-theme="plain"]');
		expect(head).toContain('prefers-reduced-motion');
	});

	it('omits the nonce attribute without a nonce, and the style with stylesheet={false}', () => {
		expect(render(ChatWidget, { props: {} }).head).not.toContain('nonce');
		expect(render(ChatWidget, { props: { stylesheet: false } }).head).not.toContain('<style');
	});

	it('ChatWindow mounts alone, themed, with its nonce', () => {
		const chat = createChat({ fetch: noFetch });
		const { body, head } = render(ChatWindow, { props: { chat, nonce: 'n1' } });
		expect(body).toContain('data-aide-theme="plain"');
		expect(body).toContain('data-mode="inline"');
		expect(body).toContain('data-part="window"');
		expect(body).toContain('role="region"');
		expect(head).toMatch(/<style[^>]*nonce="n1"/);
	});
});

describe('plain theme: stylesheet', () => {
	it('has light defaults and a dark scheme by media query and data-theme', () => {
		expect(rules).toMatch(/prefers-color-scheme:\s*dark/);
		expect(rules).toContain('[data-theme="dark"]');
	});

	it('honours reduced motion', () => {
		expect(rules).toMatch(/prefers-reduced-motion:\s*reduce/);
	});

	it('declares only --aide-* custom properties', () => {
		const declared = [...rules.matchAll(/(?:^|[\s;{])(--[\w-]+)\s*:/g)].map((m) => m[1]);
		expect(declared.length).toBeGreaterThan(10);
		expect(declared.filter((name) => !name!.startsWith('--aide-'))).toEqual([]);
	});

	it('targets the theme root and the headless parts', () => {
		for (const part of ['widget', 'launcher', 'window', 'transcript', 'message', 'composer', 'status']) {
			expect(rules).toContain(`[data-part="${part}"]`);
		}
		const selectors = [...rules.matchAll(/([^{}]+)\{/g)]
			.map((m) => m[1]!.trim())
			.filter((s) => !s.startsWith('@') && !/^(from|to|\d+%)/.test(s));
		for (const s of selectors) expect(s).toContain('data-aide-theme="plain"');
	});

	it('hides the status part visually (sr-only)', () => {
		const block = rules.match(/\[data-part="status"\]\s*\{([^}]*)\}/)?.[1] ?? '';
		expect(block).toMatch(/position:\s*absolute/);
		expect(block).toMatch(/width:\s*1px/);
		expect(block).toMatch(/clip(-path)?:/);
	});

	it('goes full screen under 480px and keeps the window inside the viewport', () => {
		expect(rules).toMatch(/max-width:\s*479\.98px|max-width:\s*480px/);
		expect(rules).toContain('100vw - 16px');
	});

	it('contains no "<" or "&", so the inlined <style> needs no escaping', () => {
		expect(CSS).not.toMatch(/[<&]/);
	});
});
