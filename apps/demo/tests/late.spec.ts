/**
 * Acceptance #14: a page the browser fills in after load is answered from the DOM under the
 * default `pageContext: 'auto'`, and the DOM text never reaches the shared cache.
 */
import { expect, test } from '@playwright/test';
import { ask, at, openChat, part, ready } from './helpers';

const MARKER = 'violet harbour lighthouse';

test('the /late page is answered from the DOM, which is never cached', async ({ page }) => {
	await page.goto(at('/late', { theme: 'plain' }));
	await ready(page);
	await expect(page.getByTestId('late-text')).toContainText(MARKER);

	const warm = page.waitForResponse((r) => r.url().includes('/api/chat?route=%2Flate'));
	await part(page, 'launcher').click();
	expect(await (await warm).json()).toMatchObject({ pageSource: 'dom' });

	const post = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/chat');
	await ask(page, 'when does the lighthouse open');
	const body = (await post).postDataJSON() as { aide: { route: string; dom: string | null } };
	expect(body.aide.route).toBe('/late');
	expect(body.aide.dom).toContain(MARKER);

	const probe = await (await page.request.get(`/api/test/last-request?marker=${encodeURIComponent(MARKER)}`)).json();
	expect(probe.markerInPrompt).toBe(true);
	expect(probe.markerInCache).toBe(false);
	expect(probe.cachedRoutes).toContain('/late');

	const full = await (await page.request.get('/llms-full.txt')).text();
	expect(full).not.toContain(MARKER);
	const md = await page.request.get('/late.md');
	if (md.ok()) expect(await md.text()).not.toContain(MARKER);
});

test('a server-rendered page sends no DOM text', async ({ page }) => {
	await page.goto(at('/privacy', { theme: 'plain' }));
	await ready(page);
	await openChat(page);
	const post = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/chat');
	await ask(page, 'what is kept');
	expect(((await post).postDataJSON() as { aide: { dom: unknown } }).aide.dom).toBeNull();
});
