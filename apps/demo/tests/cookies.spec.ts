/**
 * Acceptance #13 in the browser: the library's own read of a page carries none of the visitor's
 * cookies or headers — the demo's /echo-headers page prints its request headers, and after the
 * widget made the server read it the cached text holds no trace of the visitor's cookie.
 */
import { expect, test } from '@playwright/test';
import { at, openChat, ready } from './helpers';

test('a server-side read of the page carries no visitor cookie', async ({ page, context, baseURL }) => {
	const secret = `visitor-secret-${Date.now()}`;
	await context.addCookies([{ name: 'session', value: secret, url: baseURL! }]);
	await page.goto(at('/echo-headers', { theme: 'plain' }));
	await ready(page);
	// The visitor's own request did carry it.
	await expect(page.locator('main')).toContainText(secret);

	await openChat(page); // the warm-up makes the server read /echo-headers
	const probe = await (await page.request.get(`/api/test/last-request?marker=${secret}`)).json();
	expect(probe.cachedRoutes).toContain('/echo-headers');
	expect(probe.markerInCache).toBe(false);
	const md = await page.request.get('/echo-headers.md');
	if (md.ok()) expect(await md.text()).not.toContain(secret);
});
