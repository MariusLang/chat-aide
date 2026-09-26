/**
 * Acceptance #15 and #17 end to end: with nothing but the hook, the app serves `/llms.txt`,
 * `/llms-full.txt` and `<route>.md` for mapped pages (no file in `static/`, no build step), and
 * answers a question about a page it was never told about by reading it.
 */
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { ask, at, openChat, ready } from './helpers';

test('no llms file exists in the tree', () => {
	const staticDir = fileURLToPath(new URL('../static', import.meta.url));
	const files = existsSync(staticDir) ? readdirSync(staticDir, { recursive: true }).map(String) : [];
	expect(files.filter((f) => /llms|\.md$/.test(f))).toEqual([]);
});

test('/llms.txt lists every mapped page and no excluded one', async ({ request }) => {
	const res = await request.get('/llms.txt');
	expect(res.status()).toBe(200);
	expect(res.headers()['content-type']).toContain('text/plain');
	const body = await res.text();
	// The convention: an H1 title, then a blockquote summary, then H2 sections of link lists.
	expect(body).toMatch(/^# .+\n/);
	expect(body).toMatch(/\n> .+\n/);
	expect(body).toMatch(/\n## .+\n/);
	for (const route of ['/docs/intro', '/docs/install', '/privacy', '/pricing', '/late']) {
		expect(body).toContain(`](${route})`);
	}
	expect(body).not.toContain('/secret');
	expect(body).not.toContain('/logout');
	expect(body).not.toContain('/api/');
});

test('/llms-full.txt carries the text of the mapped pages', async ({ request }) => {
	const res = await request.get('/llms-full.txt');
	expect(res.status()).toBe(200);
	const body = await res.text();
	expect(body).toContain('Adding the chat takes three steps');
	expect(body).toContain('The library is free and MIT licensed');
	expect(body).not.toContain('This page is excluded with');
});

test('<route>.md serves a mapped page and 404s an excluded one', async ({ request }) => {
	const intro = await request.get('/docs/intro.md');
	expect(intro.status()).toBe(200);
	expect(intro.headers()['content-type']).toContain('text/markdown');
	const text = await intro.text();
	expect(text).toMatch(/^# Introduction/);
	expect(text).toContain('builds a site map at run time');
	expect((await request.get('/secret.md')).status()).toBe(404);
	expect((await request.get('/logout.md')).status()).toBe(404);
	expect((await request.get('/no-such-page.md')).status()).toBe(404);
});

test('answers about a page it was never told about, by reading it', async ({ page }) => {
	await page.goto(at('/', { theme: 'plain' }));
	await ready(page);
	await openChat(page);
	const answer = await ask(page, 'what does /docs/install say');
	await expect(answer).toContainText('pnpm add svelte-chat-aide ai');
});
