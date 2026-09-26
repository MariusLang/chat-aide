/**
 * Acceptance #2 and #10 (network part): with a hostile answer on screen, no request left the
 * browser for any origin but the site's, no `<img>` exists, raw HTML and script links render as
 * text, and an external link is text under the default `answerLinks: 'same-origin'`. The
 * server's own outbound fetches (recorded by the demo in mock mode) reach only the configured origin.
 */
import { expect, test } from '@playwright/test';
import { THEMES, ask, at, chatWindow, openChat, ready } from './helpers';

for (const theme of THEMES) {
	test(`network audit with a hostile answer (${theme})`, async ({ page, baseURL }) => {
		const origin = new URL(baseURL!).origin;
		const requested: string[] = [];
		page.on('request', (r) => requested.push(r.url()));
		const dialogs: string[] = [];
		page.on('dialog', (d) => {
			dialogs.push(d.message());
			void d.dismiss();
		});

		await page.goto(at('/', { theme }));
		await ready(page);
		await openChat(page);
		const answer = await ask(page, 'hostile');

		await expect(answer).toContainText('Hostile corpus follows.');
		const win = chatWindow(page);
		await expect(win.locator('img')).toHaveCount(0);
		await expect(win.locator('script')).toHaveCount(0);
		await expect(page.locator('img[src*="evil.example"]')).toHaveCount(0);
		await expect(answer.locator('a[href^="javascript:"], a[href^="data:"], a[href^="vbscript:"]')).toHaveCount(0);
		await expect(answer.locator('a[href*="external.example"]')).toHaveCount(0);
		await expect(answer).toContainText('External site');
		await expect(answer.locator('a[href="/privacy"]')).toHaveCount(1);
		// Raw HTML is shown as text, never parsed.
		await expect(answer).toContainText('<img src="https://images.evil.example/raw.png"');
		await expect(answer).toContainText('alt text');
		await expect(answer).toContainText('ref alt');

		await page.waitForTimeout(300);
		expect(dialogs).toEqual([]);
		const foreign = requested.filter((u) => !u.startsWith('data:') && new URL(u).origin !== origin);
		expect(foreign).toEqual([]);

		const audit = await (await page.request.get('/api/test/last-request')).json();
		for (const o of audit.outbound as string[]) expect(o).toBe(origin);
	});
}
