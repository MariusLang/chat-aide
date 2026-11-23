import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

const CLIENT = 'tests/unit/**/*.client.test.ts';

export default defineConfig({
	// svelte-package reads `preprocess` from here too: it compiles the TypeScript out of dist's components.
	plugins: [sveltekit({ preprocess: vitePreprocess(), adapter: adapter() })],
	test: {
		// Keep `?raw` CSS imports real in tests (the plain theme inlines its stylesheet).
		css: { include: [/plain\.css/] },
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					include: ['tests/unit/**/*.test.ts', 'tests/build/**/*.test.ts'],
					exclude: [CLIENT],
					environment: 'node'
				}
			},
			{
				// Components mounted in a DOM need Svelte's browser build.
				extends: true,
				resolve: { conditions: ['browser'] },
				test: { name: 'client', include: [CLIENT], environment: 'happy-dom' }
			}
		]
	}
});
