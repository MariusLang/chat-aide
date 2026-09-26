/**
 * Acceptance #9 / spec §3.8: every theme passes one keyboard and screen-reader suite — keyboard
 * open and close, focus trap, Escape, the aria-live announcement, 320 px, reduced motion.
 */
import { expect, test, type Page } from '@playwright/test';
import { THEMES, ask, at, chatWindow, launcher, openChat, part, ready } from './helpers';

const insideWindow = (page: Page) =>
	page.evaluate(() => {
		const win = document.querySelector('[data-part="window"]');
		return !!win && !!document.activeElement && win.contains(document.activeElement);
	});

for (const theme of THEMES) {
	test.describe(`a11y (${theme})`, () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(at('/', { theme }));
			await ready(page);
		});

		test('Tab reaches the launcher, Enter opens, focus is trapped, Escape closes back to the launcher', async ({
			page
		}) => {
			const button = launcher(page);
			await expect(button).toHaveAttribute('aria-label', /.+/);
			await expect(button).toHaveAttribute('aria-expanded', 'false');

			let reached = false;
			for (let i = 0; i < 40 && !reached; i++) {
				await page.keyboard.press('Tab');
				reached = await button.evaluate((el) => el === document.activeElement);
			}
			expect(reached, 'the launcher is reachable with Tab').toBe(true);

			await page.keyboard.press('Enter');
			const win = chatWindow(page);
			await expect(win).toBeVisible();
			await expect(win).toHaveAttribute('role', 'dialog');
			await expect(win).toHaveAttribute('aria-modal', 'true');
			await expect(win).toHaveAttribute('aria-labelledby', /.+/);
			await expect(button).toHaveAttribute('aria-expanded', 'true');
			await expect.poll(() => insideWindow(page)).toBe(true);

			// Give the composer a value so the send button is focusable too.
			await part(page, 'input').fill('hello');
			const count = await win.evaluate(
				(el) =>
					el.querySelectorAll('a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled])').length
			);
			for (let i = 0; i < count + 2; i++) {
				await page.keyboard.press('Tab');
				expect(await insideWindow(page), `Tab #${i + 1} stays in the dialog`).toBe(true);
			}
			for (let i = 0; i < count + 2; i++) {
				await page.keyboard.press('Shift+Tab');
				expect(await insideWindow(page), `Shift+Tab #${i + 1} stays in the dialog`).toBe(true);
			}

			await page.keyboard.press('Escape');
			await expect(win).toHaveCount(0);
			await expect(button).toBeFocused();
			await expect(button).toHaveAttribute('aria-expanded', 'false');
		});

		test('the transcript is aria-live and the finished answer is announced once', async ({ page }) => {
			await openChat(page);
			await expect(part(page, 'transcript')).toHaveAttribute('aria-live', 'polite');
			const status = part(page, 'status');
			await expect(status).toHaveAttribute('role', 'status');

			await status.evaluate((el) => {
				const seen: string[] = [];
				(window as unknown as { __announced: string[] }).__announced = seen;
				new MutationObserver(() => {
					const text = el.textContent?.trim() ?? '';
					if (text && seen.at(-1) !== text) seen.push(text);
				}).observe(el, { childList: true, characterData: true, subtree: true });
			});

			await ask(page, 'hello there');
			const expected = 'You asked: hello there. See [Privacy](/privacy).';
			await expect(status).toHaveText(expected);
			const announced = await page.evaluate(() => (window as unknown as { __announced: string[] }).__announced);
			expect(announced).toEqual([expected]);
		});

		test('at 320 px the page does not scroll sideways', async ({ page }) => {
			await page.setViewportSize({ width: 320, height: 640 });
			await page.reload();
			await ready(page);
			await openChat(page);
			await ask(page, 'a fairly long question that should wrap inside the window at three hundred and twenty pixels');
			const widths = await page.evaluate(() => ({
				doc: document.documentElement.scrollWidth,
				body: document.body.scrollWidth
			}));
			expect(widths.doc).toBeLessThanOrEqual(320);
			expect(widths.body).toBeLessThanOrEqual(320);
			const box = await chatWindow(page).boundingBox();
			expect(box).not.toBeNull();
			expect(box!.x).toBeGreaterThanOrEqual(0);
			expect(box!.x + box!.width).toBeLessThanOrEqual(320);
		});

		test('reduced motion: the window neither transitions nor animates', async ({ page }) => {
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await page.reload();
			await ready(page);
			await openChat(page);
			const motion = await chatWindow(page).evaluate((el) => {
				const cs = getComputedStyle(el);
				return {
					transition: cs.transitionDuration,
					animation: cs.animationName,
					animationDuration: cs.animationDuration
				};
			});
			// 0s, or the 0.01ms a theme may keep so that transitionend/animationend still fire.
			const instant = (list: string) => list.split(',').every((d) => parseFloat(d) <= 0.00001);
			expect(instant(motion.transition), `transition-duration ${motion.transition}`).toBe(true);
			expect(motion.animation === 'none' || instant(motion.animationDuration)).toBe(true);
		});
	});
}
