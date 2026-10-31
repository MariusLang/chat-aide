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
