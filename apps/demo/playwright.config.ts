import { defineConfig, devices } from '@playwright/test';

/**
 * Browser suite (spec §9): chromium only, against the production builds served by adapter-node
 * with the mock model. `demo` is the shadcn-initialised reference site; `plain-host` is a fresh
 * SvelteKit app without Tailwind or shadcn-svelte (apps/demo-plain-host).
 */
const DEMO = 'http://localhost:4173';
const PLAIN_HOST = 'http://localhost:4174';

export default defineConfig({
	testDir: 'tests',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
	projects: [
		{ name: 'demo', testIgnore: /plain-host\.spec\.ts/, use: { baseURL: DEMO } },
		{ name: 'plain-host', testMatch: /plain-host\.spec\.ts/, use: { baseURL: PLAIN_HOST } }
	],
	webServer: [
		{
			command: 'node build',
			url: `${DEMO}/`,
			reuseExistingServer: !process.env.CI,
			env: { AIDE_MOCK: '1', PORT: '4173', ORIGIN: DEMO }
		},
		{
			command: 'node build',
			cwd: '../demo-plain-host',
			url: `${PLAIN_HOST}/`,
			reuseExistingServer: !process.env.CI,
			env: { AIDE_MOCK: '1', PORT: '4174', ORIGIN: PLAIN_HOST }
		}
	]
});
