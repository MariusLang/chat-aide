# svelte-chat-aide

An AI chat for your own SvelteKit site, and an `llms.txt` for it, both derived from the site at
run time. Install one package, add one line to `hooks.server.ts`, drop `<ChatWidget />` into the
root layout. Nothing is generated, indexed or committed: the server reads your pages from the
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

## Quick start

```sh
pnpm add svelte-chat-aide ai @ai-sdk/anthropic
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

Requirements: Node 24+, `svelte` 5, `@sveltejs/kit` 2, `ai` 7, and the adapter package of the
provider you use (every adapter is an optional peer).

## Documentation

- [Getting started](docs/getting-started.md) — install, wire, verify, mount by hand
- [Configuration](docs/configuration.md) — every option, every limit and its ceiling
- [Providers](docs/providers.md) — the registry, install lines, credentials, `fromEnv`
- [Security](docs/security.md) — what the endpoint refuses, what it cannot, what answers may render
- [Deployment](docs/deployment.md) — `origin`, serverless, shared `Store`, proxies, crawl cost
- [Theming](docs/theming.md) — the widget's props, the three themes, CSP
- [llms.txt](docs/llms-txt.md) — how the site's own `llms.txt` is read and how one is served

## Not in this version

- The package is not published to npm yet.
- The live check that a provider actually reports a prompt-cache read is not automated (it needs
  a real key); the tests assert the cache markers and a byte-identical prefix.
- Per-adapter measurements (Vercel, Netlify, Cloudflare: whether prerendered routes are
  reachable in process, whether `event.fetch` outlives the response, how `waitUntil` is found)
  have not been made; see [Deployment](docs/deployment.md#untested-adapters).

## Repository

- `packages/svelte-chat-aide` — the library
- `apps/demo` — a SvelteKit site using it (adapter-node, mock model) and the Playwright suite
- `spec.md` — the specification

`pnpm check` runs svelte-check, eslint, vitest, Playwright, publint and `pnpm audit`.

MIT licence.
