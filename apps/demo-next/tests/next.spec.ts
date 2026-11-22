import { expect, test } from '@playwright/test';

test('the React widget warms up, answers, and quotes a page it read over the network', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Open chat' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'What does /pricing say?' }).click();
	await expect(dialog.locator('[data-part="message"][data-role="assistant"]')).toContainText(
		'The pricing page says: Shipping is free over 50 euros.'
	);
});

test('same-origin answer links navigate client-side', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Open chat' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('textbox').fill('hello');
	await dialog.getByRole('textbox').press('Enter');
	await dialog.getByRole('link', { name: 'Install' }).click();
	await expect(page).toHaveURL(/\/docs\/install$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Install');
	// The thread survived the navigation.
	await expect(page.getByRole('dialog').locator('[data-part="message"][data-role="assistant"]')).toContainText('You asked: hello.');
});

test('nothing is stored or sent before the chat is opened', async ({ page }) => {
	// Records the widget's `sessionStorage` reads and writes, from before the page's first script.
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
	const storage = () => page.evaluate(() => (window as unknown as { __aideStorage: string[] }).__aideStorage);
	const hydrated = () => page.waitForFunction(() => document.documentElement.hasAttribute('data-hydrated'));
	let requests = 0;
	page.on('request', (r) => {
		if (new URL(r.url()).pathname === '/api/chat') requests++;
	});

	await page.goto('/');
	await hydrated();
	expect(await storage()).toEqual([]);
	expect(requests).toBe(0);

	await page.getByRole('button', { name: 'Open chat' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	expect(await storage()).toEqual(expect.arrayContaining(['setItem aide:session', 'getItem aide:thread']));
	const id = await page.evaluate(() => sessionStorage.getItem('aide:session'));
	expect(id).toMatch(/^[0-9a-f-]{36}$/);
	const post = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/chat');
	await dialog.getByRole('textbox').fill('hello');
	await dialog.getByRole('textbox').press('Enter');
	expect(((await post).postDataJSON() as { aide: { sessionId: string } }).aide.sessionId).toBe(id);
	await expect(dialog.locator('[data-part="message"][data-role="assistant"]')).toContainText('You asked: hello.');
	await expect(dialog.locator('[data-part="send"]')).toBeVisible();

	// After a reload the id and the thread wait in storage, unread, for the next open.
	requests = 0;
	await page.reload();
	await hydrated();
	expect(await storage()).toEqual([]);
	expect(requests).toBe(0);
	await page.getByRole('button', { name: 'Open chat' }).click();
	await expect(page.getByRole('dialog').locator('[data-part="message"][data-role="user"]')).toContainText('hello');
	expect(await page.evaluate(() => sessionStorage.getItem('aide:session'))).toBe(id);
});

test('llms.txt lists the pages of the site', async ({ request }) => {
	const res = await request.get('/llms.txt');
	expect(res.status()).toBe(200);
	const body = await res.text();
	expect(body).toContain('/pricing');
	expect(body).toContain('/docs/install');
});

test('a cross-site request to the endpoint is refused', async ({ request }) => {
	const res = await request.get('/api/chat?route=/', { headers: { origin: 'https://evil.example' } });
	expect(res.status()).toBe(403);
});
