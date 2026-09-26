/**
 * Acceptance #1, second half (project `plain-host`): a fresh SvelteKit app without Tailwind or
 * shadcn-svelte gets a styled, working widget from the default theme's fallbacks, in light and
 * dark, and neither the app nor the CSS it loads has a Tailwind `@source` line.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { ask, chatWindow, launcher, openChat, ready } from './helpers';

const TRANSPARENT = 'rgba(0, 0, 0, 0)';
const bg = (page: Page) => chatWindow(page).evaluate((el) => getComputedStyle(el).backgroundColor);

test('the host app has no Tailwind, no shadcn-svelte and no @source', () => {
	const root = fileURLToPath(new URL('../../demo-plain-host/', import.meta.url));
	const pkg = readFileSync(`${root}package.json`, 'utf8');
	expect(pkg).not.toMatch(/tailwind|shadcn|bits-ui/);
	const src = readdirSync(`${root}src`, { recursive: true, withFileTypes: true })
		.filter((d) => d.isFile())
		.map((d) => readFileSync(`${d.parentPath}/${d.name}`, 'utf8'))
		.join('\n');
	expect(src).not.toContain('@source');
	expect(src).not.toContain('tailwindcss');
});

test('the default widget renders with its fallback palette, light and dark, and answers', async ({ page }) => {
	await page.goto('/');
	await ready(page);
	await expect(page.locator('[data-aide-theme="shadcn"]').first()).toBeAttached();
	const launcherBg = await launcher(page).evaluate((el) => getComputedStyle(el).backgroundColor);
	expect(launcherBg).not.toBe(TRANSPARENT);

	await openChat(page);
	const light = await bg(page);
	expect(light).not.toBe(TRANSPARENT);
	// No host variable exists, so the theme's own value is used.
	expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--background'))).toBe('');

	const answer = await ask(page, 'hello');
	await expect(answer).toContainText('Hello from the plain host.');

	// The loaded CSS carries no Tailwind source directive.
	const css = await page.evaluate(async () => {
		const hrefs = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map((l) => l.href);
		const inline = Array.from(document.querySelectorAll('style')).map((s) => s.textContent ?? '');
		const linked = await Promise.all(hrefs.map(async (h) => (await fetch(h)).text()));
		return [...inline, ...linked].join('\n');
	});
	expect(css.length).toBeGreaterThan(0);
	expect(css).not.toContain('@source');

	await page.emulateMedia({ colorScheme: 'dark' });
	await expect.poll(() => bg(page)).not.toBe(light);
	expect(await bg(page)).not.toBe(TRANSPARENT);
});
