<div align="center">
  <h1>chat-aide</h1>
  <p><strong>Let your site answer back.</strong></p>
  <br/>
  <p>
    A drop-in AI chat that has read every page of your site.<br/>
    A few lines on the server, one component in your layout. No indexing, no vector DB, no build step.
    <br/><br/>
    For <a href="https://svelte.dev/docs/kit">SvelteKit</a>, <a href="https://nextjs.org/">Next.js</a>, and any server that speaks web-standard <code>Request</code> and <code>Response</code>.
  </p>

  <p>
    <a href="https://chat-aide.dev/docs/getting-started">Get Started</a> •
    <a href="https://chat-aide.dev/docs/configuration">Configuration</a> •
    <a href="https://chat-aide.dev/docs/providers">Providers</a>
  </p>
</div>

---

## Features

- 🧠 **Knows your site** — Reads your pages at run time, sees the page the visitor is on, and can open any other page
- 🔌 **Any model** — Anthropic, OpenAI, Google, Mistral, and every other AI SDK provider, called directly
- 💸 **Bounded cost** — Per-visitor rate limits, daily token budgets, and prompt caching built in
- 📄 **Free `llms.txt`** — Serves `/llms.txt`, `/llms-full.txt`, and Markdown twins of your pages
- 🎨 **Widgets included** — shadcn-svelte, plain, or headless for Svelte; plain or headless for React
- 🔒 **Locked down** — The model can only read your own site; nothing is stored on the server

## Quick start

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
	origin: env.ORIGIN // your public origin, e.g. https://example.com
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

That's it. On Next.js or another framework? See the [Next.js](https://chat-aide.dev/docs/nextjs) and [other frameworks](https://chat-aide.dev/docs/other-frameworks) guides.

## Who pays, and what stops abuse

**You pay.** Every answer is billed to the provider key you put in the hook. chat-aide is not a hosted service and visitors never bring a key. The key stays on your server: importing the server module into client code fails the build.

**A script can call the endpoint.** The origin check stops other web pages from spending your key through a visitor's browser, but a script can send whatever headers it likes. These limits bound what it can spend:

| Limit | Default | Past it |
|---|---|---|
| `rateLimit.requests` | 20 messages per visitor per 10 minutes | `429 rate_limited` |
| `budget.tokensPerDay` | 200,000 tokens per visitor per UTC day | `429 budget_exhausted` |
| `budget.siteTokensPerDay` | 5,000,000 tokens for the whole site per UTC day | `429 budget_exhausted` |

A visitor is an IP address (an IPv6 /64), and addresses are cheap to rotate, so `siteTokensPerDay` is the number that bounds your bill. Price the default for your model and set it to what you are willing to pay per day:

```ts
export const handle = aide({
	provider,
	origin: env.ORIGIN,
	budget: { siteTokensPerDay: 1_000_000 }
});
```

Three things to know before you rely on it:

- **Hitting the site budget turns the chat off for everyone** until the next UTC day. A script can't exceed your cap, but it can use it up. Add `authorize` if the chat should only serve signed-in visitors.
- **The default store is in memory, per process.** On serverless or several instances the limits multiply by the instance count, so pass a [shared `store` and `salt`](https://chat-aide.dev/docs/deployment#shared-store).
- **Behind a proxy or CDN** every visitor can share one rate-limit bucket until you [configure the client address](https://chat-aide.dev/docs/security#behind-a-proxy).

A budget can overshoot by about one turn's cost, since usage is settled when a turn ends ([details](https://chat-aide.dev/docs/configuration#budgets-and-their-overshoot)). The [security guide](https://chat-aide.dev/docs/security) covers the rest.

## Packages

| Package | For |
|---|---|
| `@chat-aide/sveltekit` | SvelteKit hook and Svelte widgets |
| `@chat-aide/next` + `@chat-aide/react` | Next.js route handlers and the React widget |
| `@chat-aide/core` | Astro, React Router, Hono, Nuxt, Bun, … |

## Development

Use Node.js 24 or newer and the pnpm version pinned in `package.json`.

```sh
pnpm install
AIDE_PREVIEW=1 pnpm --filter website dev
```

Run `pnpm check` before submitting changes.

## License

MIT
