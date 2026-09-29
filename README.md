# svelte-chat-aide

An AI chat for your own site, and an `llms.txt` for it, both derived from the site at run time.
Built first for SvelteKit, now with a framework-neutral core, a React widget and a Next.js adapter.
On SvelteKit: install one package, add one line to `hooks.server.ts`, drop `<ChatWidget />` into
the root layout. Nothing is generated, indexed or committed: the server reads your pages from the
running app, anonymously, and keeps a map of them in memory.

- **Knows the site.** The model gets the page the visitor is on, an outline of every other page,
  and one tool, `read_page`, that reads one page of this site and nothing else.
- **Any provider the AI SDK has an adapter for**, called directly. No request goes through
  Vercel's AI Gateway; SDK telemetry is switched off on every call.
- **Bounded cost.** Every limit, a per-visitor rate limit, a per-visitor and a site-wide daily
  token budget, prompt caching where the provider has it.
- **Serves `/llms.txt`, `/llms-full.txt` and `<route>.md`** from the same map, unless your app
  already answers those paths.
- **Three widget layers:** headless (store + unstyled components), a dependency-free plain
  theme, and a shadcn-svelte theme (the default) that follows the host's shadcn variables.

It is not a hosted service, not a RAG platform, not for `adapter-static` sites (it needs a server
at run time), and it stores nothing on the server.

## Frameworks

| framework | server | widget | guide |
|---|---|---|---|
| SvelteKit | `svelte-chat-aide` (hook) | `svelte-chat-aide` (shadcn, plain, headless) | [Getting started](docs/getting-started.md) |
| Next.js | `@chat-aide/next` (route handlers) | `@chat-aide/react` | [Next.js and React](docs/nextjs.md) |
| Astro, React Router, Hono, Nuxt, Bun, … | `@chat-aide/core` (`createAide`, web `Request`/`Response`) | `@chat-aide/react` where React runs | [Other frameworks](docs/other-frameworks.md) |

## Quick start (SvelteKit)

```sh
pnpm add svelte-chat-aide
```

```ts
// src/hooks.server.ts
import { aide } from 'svelte-chat-aide/server';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { env } from '$env/dynamic/private';

export const handle = aide({
	provider: { name: 'anthropic', apiKey: ANTHROPIC_API_KEY, model: 'claude-haiku-4-5' },
	origin: env.ORIGIN // your public origin, e.g. https://example.com — strongly recommended
});
```

```svelte
<!-- src/routes/+layout.svelte -->
<script>
	import { ChatWidget } from 'svelte-chat-aide';
	let { children } = $props();
</script>

{@render children()}
<ChatWidget />
```

Requirements: Node 24+, `svelte` 5, `@sveltejs/kit` 2. The AI SDK (`ai` 7) and every provider
adapter come with the package, so this one command is the whole install.

## Documentation

- [Getting started](docs/getting-started.md) — SvelteKit: install, wire, verify, mount by hand
- [Next.js and React](docs/nextjs.md) — route handlers, the React widget, `useAide`
- [Other frameworks](docs/other-frameworks.md) — `createAide` on Astro, React Router, Hono, Nuxt, Bun
- [Configuration](docs/configuration.md) — every option, every limit and its ceiling
- [Providers](docs/providers.md) — the registry, install lines, credentials, `fromEnv`
- [Security](docs/security.md) — what the endpoint refuses, what it cannot, what answers may render
- [Deployment](docs/deployment.md) — `origin`, serverless, shared `Store`, proxies, crawl cost
- [Theming](docs/theming.md) — the widget's props, the three themes, CSP
- [llms.txt](docs/llms-txt.md) — how the site's own `llms.txt` is read and how one is served

## Not in this version

- The packages are not published to npm yet (the `@chat-aide` scope is not claimed).
- No Vue or plain-HTML widget yet; the React widget covers React, Next.js and Astro islands.
- Next.js does not serve the `<route>.md` twins yet (the crawler reads the HTML instead).
- The live check that a provider actually reports a prompt-cache read is not automated (it needs
  a real key); the tests assert the cache markers and a byte-identical prefix.
- Per-adapter measurements (Vercel, Netlify, Cloudflare: whether prerendered routes are
  reachable in process, whether `event.fetch` outlives the response, how `waitUntil` is found)
  have not been made; see [Deployment](docs/deployment.md#untested-adapters).

## Repository

- `packages/core` — `@chat-aide/core`: the framework-neutral server, site reader, `llms.txt` and widget helpers
- `packages/svelte-chat-aide` — the SvelteKit hook and the Svelte widgets
- `packages/react` — `@chat-aide/react`: the React widget and `useAide`
- `packages/next` — `@chat-aide/next`: Next.js App Router route handlers
- `apps/demo` — a SvelteKit site using it (adapter-node, mock model) and the Playwright suite
- `apps/demo-next` — a Next.js site with the React widget (mock model) and its Playwright suite
- `apps/website` — the project website and rendered docs, running svelte-chat-aide on itself
  (`AIDE_PREVIEW=1 pnpm --filter website dev` runs it without a provider key)
- `spec.md` — the specification

`pnpm check` runs svelte-check, eslint, vitest, Playwright, publint and `pnpm audit`.

MIT licence.
