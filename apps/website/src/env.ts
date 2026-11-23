/**
 * SvelteKit 3 only exposes the variables declared here through `$app/env/private`; anything not
 * listed is `undefined` there, with no error. Every one is optional: without them the site still
 * runs, with the chat hidden (see lib/server/aide.ts and .env.example).
 */
import { defineEnvVars } from '@sveltejs/kit/env';

/** Without a schema a variable is required; this one makes it optional. */
const optional = (value: string | undefined) => value;

export const variables = defineEnvVars({
	ORIGIN: { schema: optional, description: 'The public origin in production, e.g. https://chat-aide.dev' },
	// What `fromEnv` reads for the adapters the site includes (Anthropic and OpenRouter).
	CHAT_AIDE_PROVIDER: { schema: optional },
	CHAT_AIDE_MODEL: { schema: optional },
	CHAT_AIDE_API_KEY: { schema: optional },
	CHAT_AIDE_BASE_URL: { schema: optional },
	CHAT_AIDE_OPTIONS: { schema: optional },
	// The shared store, set by the Upstash for Redis integration on Vercel.
	KV_REST_API_URL: { schema: optional },
	KV_REST_API_TOKEN: { schema: optional },
	AIDE_SALT: { schema: optional, description: 'A long random secret: openssl rand -hex 32' },
	AIDE_PREVIEW: { schema: optional, description: 'Set to 1 for the fixed-answer model, with no key' }
});
