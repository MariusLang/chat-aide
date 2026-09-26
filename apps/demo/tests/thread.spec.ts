/** Spec §3.8 / §3.10: the thread survives a reload of the tab (sessionStorage), and only the tab. */
import { expect, test } from '@playwright/test';
import { THEMES, ask, at, openChat, ready } from './helpers';

for (const theme of THEMES) {
	test(`the thread survives a reload (${theme})`, async ({ page, context }) => {
		await page.goto(at('/', { theme }));
		await ready(page);
		await openChat(page);
		await ask(page, 'remember me');

		await page.reload();
		await ready(page);
		await openChat(page);
		const user = page.locator('[data-part="message"][data-role="user"]');
		await expect(user).toHaveCount(1);
		await expect(user).toContainText('remember me');
		await expect(page.locator('[data-part="message"][data-role="assistant"]')).toContainText(
			'You asked: remember me.'
		);

		// A new tab starts empty.
		const other = await context.newPage();
		await other.goto(at('/', { theme }));
		await ready(other);
		await openChat(other);
		await expect(other.locator('[data-part="message"]')).toHaveCount(0);
	});
}
