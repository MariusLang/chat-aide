import { expect, type Locator, type Page } from '@playwright/test';

export const THEMES = ['shadcn', 'plain', 'headless'] as const;
export type Theme = (typeof THEMES)[number];

/** A demo URL with the widget switches of `src/lib/params.ts`. */
export function at(path: string, params: Record<string, string> = {}): string {
	const q = new URLSearchParams(params).toString();
	return q ? `${path}?${q}` : path;
}

export const part = (page: Page | Locator, name: string): Locator => page.locator(`[data-part="${name}"]`);

export const launcher = (page: Page) => part(page, 'launcher');
export const chatWindow = (page: Page) => part(page, 'window');

/** Waits for the first paint to hydrate (SvelteKit marks the body once started). */
export async function ready(page: Page): Promise<void> {
	await page.waitForFunction(() => document.documentElement.hasAttribute('data-hydrated'), undefined, {
		timeout: 10_000
	});
}

/** Opens the widget with the launcher and waits for the warm-up `GET` to answer. */
export async function openChat(page: Page): Promise<void> {
	const warm = page.waitForResponse((r) => r.url().includes('/api/chat?route=') && r.request().method() === 'GET');
	await launcher(page).click();
	await expect(chatWindow(page)).toBeVisible();
	await warm;
}

/** Sends `text` and waits for the answer to finish streaming; returns the answer's element. */
export async function ask(page: Page, text: string): Promise<Locator> {
	const answers = page.locator('[data-part="message"][data-role="assistant"]');
	const before = await answers.count();
	const input = part(page, 'input');
	await input.fill(text);
	await input.press('Enter');
	await expect(answers).toHaveCount(before + 1, { timeout: 15_000 });
	const answer = answers.nth(before);
	await expect(answer).not.toHaveAttribute('aria-busy', 'true', { timeout: 15_000 });
	await expect(part(page, 'send')).toBeVisible();
	return answer;
}
