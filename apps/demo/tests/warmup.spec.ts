/**
 * Spec §3.4 / §9: the warm-up `GET {endpoint}?route=` runs on open and again on every client-side
 * navigation while the widget is open — by a site link and by a same-origin link in an answer,
 * which navigates with `goto` (no document reload).
 */
import { expect, test, type Request } from '@playwright/test';
import { THEMES, ask, at, openChat, ready } from './helpers';

const warmRoute = (r: Request): string | null => {
	const url = new URL(r.url());
	return r.method() === 'GET' && url.pathname === '/api/chat' ? url.searchParams.get('route') : null;
};

for (const theme of THEMES) {
	test(`the warm-up is repeated on client-side navigation (${theme})`, async ({ page }) => {
		const routes: string[] = [];
		page.on('request', (r) => {
			const route = warmRoute(r);
			if (route !== null) routes.push(route);
		});
		let documents = 0;
		page.on('request', (r) => {
			if (r.resourceType() === 'document') documents++;
		});

		await page.goto(at('/', { theme }));
		await ready(page);
		expect(routes).toEqual([]);
		await openChat(page);
		expect(routes).toEqual(['/']);

		const next = page.waitForRequest((r) => warmRoute(r) === '/docs/intro');
		await page.getByTestId('nav-/docs/intro').click();
		await next;
		await expect(page).toHaveURL(/\/docs\/intro/);
		expect(routes).toEqual(['/', '/docs/intro']);

		const answer = await ask(page, 'where is the privacy page');
		const viaAnswer = page.waitForRequest((r) => warmRoute(r) === '/privacy');
		await answer.locator('a[href="/privacy"]').click();
		await viaAnswer;
		await expect(page).toHaveURL(/\/privacy$/);
		expect(routes).toEqual(['/', '/docs/intro', '/privacy']);
		expect(documents, 'no document reload').toBe(1);
	});
}
