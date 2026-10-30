/**
 * The site's own chat-aide, on Vercel. The chat only exists once everything that bounds its cost
 * is configured: the CHAT_AIDE_* provider variables, ORIGIN, and a shared store (Upstash's KV_REST_API_*
 * and AIDE_SALT). Missing any of them, the site still runs and the chat is hidden, so a deployment
 * can never spend the key with per-instance limits. AIDE_PREVIEW=1 shows the chat with a
 * fixed-answer model and no key, for working on the site.
 */
import { env } from '$env/dynamic/private';
import type { Handle } from '@sveltejs/kit';
import { aide, fromEnv, type AideHandle } from '@chat-aide/sveltekit/server';
import { previewModel } from './preview-model';
import { redisStore } from './store';

const preview = (): boolean => env.AIDE_PREVIEW === '1';

const live = (): boolean =>
	Boolean(
		env.CHAT_AIDE_PROVIDER &&
			env.ORIGIN &&
			env.KV_REST_API_URL &&
			env.KV_REST_API_TOKEN &&
			env.AIDE_SALT
	);

export const chatConfigured = (): boolean => preview() || live();

/**
 * Vercel's file tracing cannot follow the core's `import(pkg)`, so an adapter must be imported by
 * name to reach the function. A provider without an entry here is refused at the first request.
 */
const adapters: Record<string, () => Promise<Record<string, unknown>>> = {
	'@ai-sdk/anthropic': () => import('@ai-sdk/anthropic'),
	'@openrouter/ai-sdk-provider': () => import('@openrouter/ai-sdk-provider')
};

const importer = (pkg: string): Promise<Record<string, unknown>> =>
	adapters[pkg]?.() ?? Promise.reject(new Error(`chat-aide: add ${pkg} to the adapters in lib/server/aide.ts`));

let instance: AideHandle | undefined;

/** Created on the first request: the build analyses server modules without the environment. */
function aideHandle(): AideHandle {
	instance ??= aide({
		provider: preview() ? { name: 'custom', model: 'preview', instance: previewModel() } : fromEnv(env),
		origin: env.ORIGIN || undefined,
		...(preview() ? {} : { store: redisStore(env.KV_REST_API_URL!, env.KV_REST_API_TOKEN!), salt: env.AIDE_SALT }),
		persona: {
			name: 'Aide',
			tone: 'friendly, concise, practical; show code when it helps',
			audience: 'developers evaluating or installing chat-aide'
		},
		facts: [
			'This website is itself built with SvelteKit and uses chat-aide for this chat, with the default shadcn theme.',
			'chat-aide is MIT licensed.',
			'chat-aide works on SvelteKit (the @chat-aide/sveltekit package), on Next.js with React (@chat-aide/next and @chat-aide/react), and on any framework with web-standard Request/Response through createAide from @chat-aide/core (Astro, React Router, Hono, Nuxt, Bun).'
		],
		suggestions: {
			'*': ['How do I get started?', 'Does it work with Next.js?', 'Which AI providers can I use?'],
			'/docs/providers': ['How do I use OpenAI instead of Anthropic?'],
			'/docs/deployment': ['Does it work on Vercel?'],
			'/docs/security': ['Can someone abuse my API key?']
		}
	}, { importer });
	return instance;
}

export const handle: Handle = (input) => (chatConfigured() ? aideHandle()(input) : input.resolve(input.event));
