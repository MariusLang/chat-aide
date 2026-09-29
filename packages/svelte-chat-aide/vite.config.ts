import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['tests/unit/**/*.test.ts', 'tests/build/**/*.test.ts'],
		environment: 'node',
		// Keep `?raw` CSS imports real in tests (the plain theme inlines its stylesheet).
		css: { include: [/plain\.css/] }
	}
});
