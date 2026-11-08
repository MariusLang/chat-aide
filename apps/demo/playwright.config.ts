import { defineConfig, devices } from '@playwright/test';

/**
 * Browser suite (spec §9): chromium only, against the production builds served by adapter-node
 * with the mock model. `demo` is the shadcn-initialised reference site; `plain-host` is a fresh
 * SvelteKit app without Tailwind or shadcn-svelte (apps/demo-plain-host); `kit3` is a SvelteKit 3
 * site (apps/demo-kit3).
 */
const DEMO = 'http://localhost:4173';
const PLAIN_HOST = 'http://localhost:4174';
const KIT3 = 'http://localhost:4175';

export default defineConfig({
	testDir: 'tests',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
	projects: [
		{ name: 'demo', testIgnore: /(plain-host|kit3)\.spec\.ts/, use: { baseURL: DEMO } },
		{ name: 'plain-host', testMatch: /plain-host\.spec\.ts/, use: { baseURL: PLAIN_HOST } },
		{ name: 'kit3', testMatch: /kit3\.spec\.ts/, use: { baseURL: KIT3 } }
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
		},
		{
			command: 'node build',
			cwd: '../demo-kit3',
			url: `${KIT3}/`,
			reuseExistingServer: !process.env.CI,
			env: { AIDE_MOCK: '1', PORT: '4175', ORIGIN: KIT3 }
		}
	]
});
