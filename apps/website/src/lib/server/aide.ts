/**
 * The site's own svelte-chat-aide. The provider comes from the SVELTE_CHAT_AIDE_* variables;
 * without them the site still runs and the chat is hidden. AIDE_PREVIEW=1 shows the chat with a
 * fixed-answer model, for working on the site without a key.
 */
import { env } from '$env/dynamic/private';
import type { Handle } from '@sveltejs/kit';
import { aide, fromEnv, type AideHandle } from 'svelte-chat-aide/server';
import { previewModel } from './preview-model';

const preview = (): boolean => env.AIDE_PREVIEW === '1';

export const chatConfigured = (): boolean => preview() || Boolean(env.SVELTE_CHAT_AIDE_PROVIDER);

let instance: AideHandle | undefined;

/** Created on the first request: the build analyses server modules without the environment. */
function aideHandle(): AideHandle {
	instance ??= aide({
		provider: preview() ? { name: 'custom', model: 'preview', instance: previewModel() } : fromEnv(env),
		origin: env.ORIGIN || undefined,
		persona: {
			name: 'Aide',
			tone: 'friendly, concise, practical; show code when it helps',
			audience: 'SvelteKit developers evaluating or installing svelte-chat-aide'
		},
		facts: [
			'This website is itself built with SvelteKit and uses svelte-chat-aide for this chat, with the default shadcn theme.',
			'The package is MIT licensed. It is not published to npm yet.',
			'It works on SvelteKit (svelte-chat-aide), on Next.js with React (@chat-aide/next and @chat-aide/react), and on any framework with web-standard Request/Response through createAide from @chat-aide/core (Astro, React Router, Hono, Nuxt, Bun).'
		],
		suggestions: {
			'*': ['How do I get started?', 'Does it work with Next.js?', 'Which AI providers can I use?'],
			'/docs/providers': ['How do I use OpenAI instead of Anthropic?'],
			'/docs/deployment': ['Does it work on Vercel?'],
			'/docs/security': ['Can someone abuse my API key?']
		}
	});
	return instance;
}

export const handle: Handle = (input) => (chatConfigured() ? aideHandle()(input) : input.resolve(input.event));
