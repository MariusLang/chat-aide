import { defineConfig, devices } from '@playwright/test';

const BASE = 'http://localhost:4175';

/** The Next.js demo against its production build (`next start`), with the mock model. */
export default defineConfig({
	testDir: 'tests',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: { ...devices['Desktop Chrome'], baseURL: BASE, trace: 'retain-on-failure' },
	webServer: {
		command: 'next start -p 4175',
		url: `${BASE}/`,
		reuseExistingServer: !process.env.CI,
		env: { AIDE_MOCK: '1', SITE_ORIGIN: BASE }
	}
});
