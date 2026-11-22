import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

const CLIENT = 'tests/unit/**/*.client.test.ts';

export default defineConfig({
	plugins: [sveltekit()],
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
