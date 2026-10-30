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
