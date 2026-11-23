import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ runtime: 'nodejs24.x' }),
			// SvelteKit 3 dropped the built-in `$lib`; shadcn-svelte's components import through it.
			alias: { $lib: 'src/lib' }
		})
	],
	// The docs pages read the repository's own docs/*.md.
	server: { fs: { allow: ['../../docs'] } }
});
