/**
 * Issue #21 (project `kit3`): the library on a SvelteKit 3 site (apps/demo-kit3) — the hook
 * typed with Kit 3's `Handle`, variables declared in `src/env.ts`, prerendered pages read
 * through `origin`, the headless widget, and the llms.txt routes.
 */
import { expect, test } from '@playwright/test';
import { ask, chatWindow, launcher, openChat, part, ready } from './helpers';

test('the widget warms up, answers, and its same-origin links do not preload', async ({ page }) => {
	await page.goto('/');
	await ready(page);
	await openChat(page);
	const answer = await ask(page, 'hello');
	await expect(answer).toContainText('Hello from SvelteKit 3.');

	const link = answer.getByRole('link', { name: 'About' });
	await expect(link).toHaveAttribute('href', '/about');
	await expect(link).toHaveAttribute('data-sveltekit-preload-data', /^(off|false)$/);
	await expect(link).toHaveAttribute('data-sveltekit-preload-code', /^(off|false)$/);

	// The body asks for preload-data="hover"; hovering an answer link must load nothing.
	const loaded: string[] = [];
	page.on('request', (r) => {
		if (r.url().includes('/_app/') || r.url().includes('__data.json')) loaded.push(r.url());
	});
	await link.hover();
	await page.waitForTimeout(500);
	expect(loaded).toEqual([]);

	// A click still navigates, client side.
	await link.click();
	await expect(page).toHaveURL(/\/about$/);
	await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
});

test('Escape closes the chat back to the launcher', async ({ page }) => {
	await page.goto('/');
	await ready(page);
	await openChat(page);
	await part(page, 'input').focus();
	await page.keyboard.press('Escape');
	await expect(chatWindow(page)).toHaveCount(0);
	await expect(launcher(page)).toBeFocused();
});

test('the warm-up reads a prerendered page through origin', async ({ request }) => {
	const warm = () => request.get('/api/chat?route=/about', { headers: { 'sec-fetch-site': 'same-origin' } });
	expect((await warm()).status()).toBe(200);
	// The first warm-up starts the crawl; the page is mapped once it has been read.
	await expect.poll(async () => (await (await warm()).json()).mapped).toBe(true);
});

test('/llms.txt and <route>.md are served', async ({ request }) => {
	const llms = await request.get('/llms.txt');
	expect(llms.status()).toBe(200);
	expect(await llms.text()).toContain('[About](/about)');
	const md = await request.get('/about.md');
	expect(md.status()).toBe(200);
	expect(md.headers()['content-type']).toContain('text/markdown');
});

test('a cross-origin POST is refused', async ({ request }) => {
	const res = await request.post('/api/chat', {
		headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
		data: {}
	});
	expect(res.status()).toBe(403);
	expect((await res.json()).error).toBe('origin_refused');
});
