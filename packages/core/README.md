# @chat-aide/core

The framework-neutral core of chat-aide: an AI chat for your own site, and an `llms.txt` for it,
both derived from the site at run time. It holds the chat handler, the site reader and crawler,
the `llms.txt` generator, the provider registry, the guards and budgets, and the browser helpers
every widget shares.

Most sites use it through a framework package:

- SvelteKit: [`@chat-aide/sveltekit`](../sveltekit) (hook and Svelte widgets)
- Next.js: [`@chat-aide/next`](../next) with [`@chat-aide/react`](../react)
- Anything with web-standard `Request` / `Response` (Astro, React Router, Hono, Nuxt, Bun):
  `createAide` from this package

```ts
import { createAide, fromEnv } from '@chat-aide/core';

export const aide = createAide({ provider: fromEnv(process.env), origin: 'https://example.com' });

// mount aide.chat at /api/chat (GET and POST), aide.llmsTxt at /llms.txt
```

## Entries

| import | what |
|---|---|
| `@chat-aide/core` | `createAide`, `toAideEvent`, `createChatHandler`, `fromEnv`, `memoryStore`, `defaultSystemPrompt`, the config types. Server only. |
| `@chat-aide/core/llms` | the `llms.txt`, `llms-full.txt` and `<route>.md` handlers of an event |
| `@chat-aide/core/client` | browser helpers for widgets: session and thread, warm-up, request body, refusals, safe markdown, focus trap, strings |
| `@chat-aide/core/extract` | the page-text extractor, `extract(document)` |
| `@chat-aide/core/plain.css` | the plain theme's stylesheet, shared by the Svelte and React widgets |
| `@chat-aide/core/internal` | pieces for framework adapters; not a stable API |

Docs: [Other frameworks](../../docs/other-frameworks.md), [Configuration](../../docs/configuration.md),
[Providers](../../docs/providers.md), [Security](../../docs/security.md).

MIT licence.
