/**
 * SvelteKit 3 only exposes the variables declared here through `$app/env/private`; anything not
 * listed is `undefined` there, with no error. Declare `ORIGIN` and the `CHAT_AIDE_*` variables
 * that `fromEnv` reads for your provider.
 */
import { defineEnvVars } from '@sveltejs/kit/env';

/** Without a schema a variable is required; this one makes it optional. */
const optional = (value: string | undefined) => value;

export const variables = defineEnvVars({
	ORIGIN: { description: 'The public origin of the site, e.g. https://example.com' },
	CHAT_AIDE_PROVIDER: { schema: optional },
	CHAT_AIDE_MODEL: { schema: optional },
	CHAT_AIDE_API_KEY: { schema: optional },
	AIDE_MOCK: { schema: optional, description: 'Set to 1 for the mock model the Playwright run uses' }
});
