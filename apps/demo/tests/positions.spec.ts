/**
 * Spec §3.8 positions: the launcher and the floating window sit in the configured corner. The
 * headless theme has no CSS, so placement is a styled theme's job and it is not checked there.
 */
import { expect, test } from '@playwright/test';
import { at, chatWindow, launcher, openChat, ready } from './helpers';

const POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const;
const W = 1280;
const H = 800;
const EDGE = 96;

for (const theme of ['shadcn', 'plain'] as const) {
	for (const position of POSITIONS) {
		test(`${position} (${theme})`, async ({ page }) => {
			await page.setViewportSize({ width: W, height: H });
			await page.goto(at('/', { theme, position }));
			await ready(page);
			const top = position.startsWith('top');
			const left = position.endsWith('left');

			const l = (await launcher(page).boundingBox())!;
			if (left) expect(l.x).toBeLessThan(EDGE);
			else expect(W - (l.x + l.width)).toBeLessThan(EDGE);
			if (top) expect(l.y).toBeLessThan(EDGE);
			else expect(H - (l.y + l.height)).toBeLessThan(EDGE);

			await openChat(page);
			const w = (await chatWindow(page).boundingBox())!;
			if (left) expect(w.x).toBeLessThan(EDGE);
			else expect(W - (w.x + w.width)).toBeLessThan(EDGE);
			// The window opens away from the launcher's edge and stays in the viewport.
			if (top) expect(w.y).toBeLessThan(H / 2);
			else expect(w.y + w.height).toBeGreaterThan(H / 2);
			expect(w.y).toBeGreaterThanOrEqual(0);
			expect(w.y + w.height).toBeLessThanOrEqual(H);
		});
	}
}
