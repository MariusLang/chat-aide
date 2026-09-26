/**
 * Acceptance #1, first half: on a shadcn-svelte site the shadcn theme follows the host's
 * variables, light and dark (mode-watcher toggles `.dark` on <html>).
 */
import { expect, test, type Page } from '@playwright/test';
import { at, chatWindow, launcher, openChat, ready } from './helpers';

/** The computed colour of `value` on a probe element in the document. */
const resolve = (page: Page, prop: 'backgroundColor' | 'color', value: string) =>
	page.evaluate(
		([prop, value]) => {
			const el = document.createElement('div');
			el.style[prop as 'color'] = value;
			document.body.append(el);
			const out = getComputedStyle(el)[prop as 'color'];
			el.remove();
			return out;
		},
		[prop, value] as const
	);

const bg = (page: Page) => chatWindow(page).evaluate((el) => getComputedStyle(el).backgroundColor);

test('the shadcn theme follows the host variables, light and dark', async ({ page }) => {
	await page.goto(at('/', { theme: 'shadcn' }));
	await ready(page);
	await expect(page.locator('html')).not.toHaveClass(/dark/);
	const launcherBg = await launcher(page).evaluate((el) => getComputedStyle(el).backgroundColor);
	expect(launcherBg).toBe(await resolve(page, 'backgroundColor', 'var(--primary)'));

	await openChat(page);
	const light = await bg(page);
	expect(light).toBe(await resolve(page, 'backgroundColor', 'var(--background)'));

	// Host overrides flow through: a changed --background repaints the widget.
	await page.evaluate(() => document.documentElement.style.setProperty('--background', 'rgb(1, 2, 3)'));
	expect(await bg(page)).toBe('rgb(1, 2, 3)');
	await page.evaluate(() => document.documentElement.style.removeProperty('--background'));

	// Switch the host to dark with its own toggle (mode-watcher), then reopen the widget.
	await page.keyboard.press('Escape');
	await page.getByTestId('mode-toggle').click();
	await expect(page.locator('html')).toHaveClass(/dark/);
	await openChat(page);
	await expect.poll(() => bg(page)).not.toBe(light);
	expect(await bg(page)).toBe(await resolve(page, 'backgroundColor', 'var(--background)'));
});
