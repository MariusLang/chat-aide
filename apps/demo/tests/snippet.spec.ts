/** Spec §3.8 anywhere-placement: the `launcher` snippet replaces the floating button. */
import { expect, test } from '@playwright/test';
import { THEMES, at, chatWindow, part, ready } from './helpers';

for (const theme of THEMES) {
	test(`a header button from the launcher snippet opens the window (${theme})`, async ({ page }) => {
		await page.goto(at('/', { theme, launcher: 'header' }));
		await ready(page);
		await expect(part(page, 'launcher')).toHaveCount(0);

		const button = page.getByTestId('header-launcher');
		await expect(button).toHaveAttribute('aria-expanded', 'false');
		await button.click();
		await expect(chatWindow(page)).toBeVisible();
		await expect(button).toHaveAttribute('aria-expanded', 'true');

		await page.keyboard.press('Escape');
		await expect(chatWindow(page)).toHaveCount(0);
		await expect(button).toBeFocused();
	});
}
