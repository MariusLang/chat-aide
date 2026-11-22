/**
 * Spec §3.10: a page view leaves the visitor's device alone. Until the chat is opened the widget
 * reads and writes no `sessionStorage` and sends nothing; the id and the thread come with the
 * first open.
 */
import { expect, test, type Page, type Request } from '@playwright/test';
import { THEMES, ask, at, openChat, ready } from './helpers';

/** Records the widget's `sessionStorage` reads and writes, from before the page's first script. */
async function watchStorage(page: Page): Promise<() => Promise<string[]>> {
	await page.addInitScript(() => {
		const log: string[] = [];
		Object.defineProperty(window, '__aideStorage', { value: log });
		for (const method of ['getItem', 'setItem'] as const) {
			const original = Storage.prototype[method] as (this: Storage, ...args: string[]) => unknown;
			Storage.prototype[method] = function (this: Storage, ...args: string[]) {
				if (this === window.sessionStorage && args[0]?.startsWith('aide:')) log.push(`${method} ${args[0]}`);
				return original.apply(this, args);
			} as never;
		}
	});
	return () => page.evaluate(() => (window as unknown as { __aideStorage: string[] }).__aideStorage);
}

const toEndpoint = (r: Request): boolean => new URL(r.url()).pathname === '/api/chat';
const stored = (page: Page, key: string) => page.evaluate((k) => sessionStorage.getItem(k), key);

for (const theme of THEMES) {
	test(`nothing is stored or sent before the chat is opened (${theme})`, async ({ page }) => {
		const storage = await watchStorage(page);
		let requests = 0;
		page.on('request', (r) => {
			if (toEndpoint(r)) requests++;
		});

		await page.goto(at('/', { theme }));
		await ready(page);
		expect(await storage()).toEqual([]);
		expect(await stored(page, 'aide:session')).toBeNull();
		expect(requests).toBe(0);

		await openChat(page);
		expect(await storage()).toEqual(expect.arrayContaining(['setItem aide:session', 'getItem aide:thread']));
		const id = await stored(page, 'aide:session');
		expect(id).toMatch(/^[0-9a-f-]{36}$/);
		const post = page.waitForRequest((r) => r.method() === 'POST' && toEndpoint(r));
		await ask(page, 'remember me');
		expect(((await post).postDataJSON() as { aide: { sessionId: string } }).aide.sessionId).toBe(id);

		// After a reload the id and the thread wait in storage, unread, for the next open.
		requests = 0;
		await page.reload();
		await ready(page);
		expect(await storage()).toEqual([]);
		expect(requests).toBe(0);

		await openChat(page);
		await expect(page.locator('[data-part="message"][data-role="user"]')).toContainText('remember me');
		const again = page.waitForRequest((r) => r.method() === 'POST' && toEndpoint(r));
		await ask(page, 'and again');
		expect(((await again).postDataJSON() as { aide: { sessionId: string } }).aide.sessionId).toBe(id);
	});

	test(`inline mode reads the thread when it renders and stores no id before a message (${theme})`, async ({ page }) => {
		const storage = await watchStorage(page);
		await page.goto(at('/', { theme, mode: 'inline' }));
		await ready(page);
		await expect.poll(storage).toEqual(['getItem aide:thread']);
		expect(await stored(page, 'aide:session')).toBeNull();

		const post = page.waitForRequest((r) => r.method() === 'POST' && toEndpoint(r));
		await ask(page, 'hello');
		const id = await stored(page, 'aide:session');
		expect(id).toMatch(/^[0-9a-f-]{36}$/);
		expect(((await post).postDataJSON() as { aide: { sessionId: string } }).aide.sessionId).toBe(id);
	});
}
