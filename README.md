# chat-aide

An AI chat for your own site, and an `llms.txt` for it, both derived from the site at run time.
It runs on SvelteKit, on Next.js with React, and on any server that speaks web-standard
`Request` and `Response`. Nothing is generated, indexed or committed: the server reads your pages
anonymously and keeps a map of them in memory.

- **Knows the site.** The model gets the page the visitor is on, an outline of every other page,
  and one tool, `read_page`, that reads one page of this site and nothing else.
- **Any provider the AI SDK has an adapter for**, called directly. No request goes through
  Vercel's AI Gateway; SDK telemetry is switched off on every call.
- **Bounded cost.** Every limit, a per-visitor rate limit, a per-visitor and a site-wide daily
  token budget, prompt caching where the provider has it.
- **Serves `/llms.txt` and `/llms-full.txt`** from the same map, and `<route>.md` on SvelteKit and
  through `createAide`, unless your app already answers those paths.
- **Widgets for Svelte and React.** Svelte has headless components, a dependency-free plain theme
  and a shadcn-svelte theme (the default). React has the plain theme and headless parts.

It is not a hosted service, not a RAG platform, not for static-only sites (it needs a server at
run time), and it stores nothing on the server beyond what you give it a shared store for.

## Which package

Requirements everywhere: Node 24+. The AI SDK and every provider adapter come with the packages.

| framework | install | server | widget | guide |
|---|---|---|---|---|
| SvelteKit (Svelte 5, Kit 2) | `pnpm add @chat-aide/sveltekit` | hook | shadcn, plain, headless | [SvelteKit](https://chat-aide.dev/docs/getting-started) |
| Next.js 15.1+ (React 18, 19) | `pnpm add @chat-aide/next @chat-aide/react` | route handlers | plain, headless parts | [Next.js and React](https://chat-aide.dev/docs/nextjs) |
| Astro, React Router, Hono, Nuxt, Bun, … | `pnpm add @chat-aide/core` | `createAide` | `@chat-aide/react` where React runs | [Other frameworks](https://chat-aide.dev/docs/other-frameworks) |

`@chat-aide/core` is the shared server underneath all of them: the same crawler, prompt,
providers, limits and security rules.

## Quick start: SvelteKit

```sh
pnpm add @chat-aide/sveltekit
```

```ts
// src/hooks.server.ts
import { aide } from '@chat-aide/sveltekit/server';
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
	import { ChatWidget } from '@chat-aide/sveltekit';
	let { children } = $props();
</script>

{@render children()}
<ChatWidget />
```

## Quick start: Next.js

```sh
pnpm add @chat-aide/next @chat-aide/react
```

```js
// next.config.mjs: the core loads the provider's adapter at run time
export default { serverExternalPackages: ['@chat-aide/core'] };
```

```ts
// app/api/chat/route.ts
import { createAide, fromEnv } from '@chat-aide/next';

const aide = createAide(() => ({
	provider: fromEnv(process.env),
	origin: process.env.SITE_ORIGIN! // required: the site is read over the network from it
}));

export const { GET, POST } = aide.chat;
```

```tsx
// app/layout.tsx
import '@chat-aide/react/plain.css';
import { ChatWidget } from '@chat-aide/react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>
				{children}
				<ChatWidget />
			</body>
		</html>
	);
}
```

## Quick start: any other server

```sh
pnpm add @chat-aide/core
```

```ts
import { createAide, fromEnv } from '@chat-aide/core';

export const aide = createAide({
	provider: fromEnv(process.env),
	origin: 'https://example.com' // required: the site is read over the network from it
});

// Mount aide.chat at /api/chat, or send everything to aide.fetch, which answers the endpoint,
// /llms.txt, /llms-full.txt and *.md, and 404 for anything else.
```

The [Other frameworks](https://chat-aide.dev/docs/other-frameworks) guide shows the mount for Astro, React Router, Hono,
Nuxt and Bun. There is no Vue widget yet.

## Documentation

- [SvelteKit](https://chat-aide.dev/docs/getting-started) — install, wire, verify, mount by hand
- [Next.js and React](https://chat-aide.dev/docs/nextjs) — route handlers, the React widget, `useAide`
- [Other frameworks](https://chat-aide.dev/docs/other-frameworks) — `createAide` on Astro, React Router, Hono, Nuxt, Bun
- [Configuration](https://chat-aide.dev/docs/configuration) — every option, every limit and its ceiling
- [Providers](https://chat-aide.dev/docs/providers) — the registry, install lines, credentials, `fromEnv`
- [Security](https://chat-aide.dev/docs/security) — what the endpoint refuses, what it cannot, what answers may render
- [Deployment](https://chat-aide.dev/docs/deployment) — `origin`, serverless, shared `Store`, proxies, crawl cost
- [Theming](https://chat-aide.dev/docs/theming) — the widget's props, the three themes, CSP
- [llms.txt](https://chat-aide.dev/docs/llms-txt) — how the site's own `llms.txt` is read and how one is served

## Not in this version

- No Vue or plain-HTML widget yet; the React widget covers React, Next.js and Astro islands.
- Next.js does not serve the `<route>.md` twins yet (the crawler reads the HTML instead).
- The live check that a provider actually reports a prompt-cache read is not automated (it needs
  a real key); the tests assert the cache markers and a byte-identical prefix.
- Per-adapter measurements (Vercel, Netlify, Cloudflare: whether prerendered routes are
  reachable in process, whether `event.fetch` outlives the response, how `waitUntil` is found)
  have not been made; see [Deployment](https://chat-aide.dev/docs/deployment#untested-adapters).

## Repository

- `packages/core` — `@chat-aide/core`: the framework-neutral server, site reader, `llms.txt` and widget helpers
- `packages/sveltekit` — `@chat-aide/sveltekit`: the SvelteKit hook and the Svelte widgets
- `packages/react` — `@chat-aide/react`: the React widget and `useAide`
- `packages/next` — `@chat-aide/next`: Next.js App Router route handlers
- `apps/demo` — a SvelteKit site using it (adapter-node, mock model) and the Playwright suite
- `apps/demo-next` — a Next.js site with the React widget (mock model) and its Playwright suite
- `apps/website` — the project website and rendered docs, running chat-aide on itself
  (`AIDE_PREVIEW=1 pnpm --filter website dev` runs it without a provider key)
- `spec.md` — the specification

`pnpm check` runs svelte-check, eslint, vitest, Playwright, publint and `pnpm audit`.

MIT licence.
