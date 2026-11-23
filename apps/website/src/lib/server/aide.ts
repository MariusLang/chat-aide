/**
 * The site's own chat-aide, on Vercel. The chat only exists once everything that bounds its cost
 * is configured: the CHAT_AIDE_* provider variables, ORIGIN, and a shared store (Upstash's KV_REST_API_*
 * and AIDE_SALT). Missing any of them, the site still runs and the chat is hidden, so a deployment
 * can never spend the key with per-instance limits. AIDE_PREVIEW=1 shows the chat with a
 * fixed-answer model and no key, for working on the site.
 *
 * The pages come from the markdown bundled with the site instead of a crawl: every instance knows
 * every page from its first request, and no read can fail. The crawl is what the demo apps test.
 */
import * as env from '$app/env/private';
import type { Handle } from '@sveltejs/kit/hooks';
import { aide, fromEnv, type AideHandle, type ProviderConfig } from '@chat-aide/sveltekit/server';
import { chatPages } from './doc-sources';
import { previewModel } from './preview-model';
import { redisStore } from './store';

const preview = (): boolean => env.AIDE_PREVIEW === '1';

let provider: ProviderConfig | null | undefined;

/**
 * The provider from the CHAT_AIDE_* variables, read once, or null when they do not make one (no
 * model, no key, an unknown name). Without it the chat is hidden like with any other missing
 * variable: the hook must not throw on every request of the site.
 */
function providerConfig(): ProviderConfig | null {
	if (provider === undefined) {
		try {
			provider = fromEnv(env);
		} catch (error) {
			console.error('chat-aide: the chat is off, the provider variables are incomplete.', error);
			provider = null;
		}
	}
	return provider;
}

const live = (): boolean =>
	Boolean(
		env.CHAT_AIDE_PROVIDER &&
			env.ORIGIN &&
			env.KV_REST_API_URL &&
			env.KV_REST_API_TOKEN &&
			env.AIDE_SALT &&
			providerConfig()
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
		provider: preview() ? { name: 'custom', model: 'preview', instance: previewModel() } : providerConfig()!,
		origin: env.ORIGIN || undefined,
		...(preview() ? {} : { store: redisStore(env.KV_REST_API_URL!, env.KV_REST_API_TOKEN!), salt: env.AIDE_SALT }),
		// What the key may spend per UTC day, well under the library's defaults: anyone can script the endpoint.
		budget: { tokensPerDay: 100_000, siteTokensPerDay: 1_000_000 },
		pages: { source: async () => chatPages() },
		llms: { serveSource: true },
		// The outline holds every page's headings, so the model picks the right page at the first
		// read. A question across pages takes two reads and an answer; a setup answer runs long.
		limits: { outlineChars: 12_000, maxSteps: 4, maxOutputTokens: 1_500 },
		persona: {
			name: 'Aide',
			tone: 'friendly, concise, practical; show code when it helps',
			audience: 'developers evaluating or installing chat-aide'
		},
		facts: [
			'This website is itself built with SvelteKit and uses chat-aide for this chat, with the default shadcn theme.',
			'chat-aide is free and MIT licensed. It is a library, not a hosted service: the site owner pays their model provider for each answer, with their own API key.',
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
