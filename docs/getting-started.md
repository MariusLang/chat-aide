# Getting started

## 1. Install

```sh
pnpm add svelte-chat-aide ai @ai-sdk/anthropic
```

Install the adapter of the provider you use; see [Providers](providers.md) for every name and
its install line. The library needs Node 24+, Svelte 5, SvelteKit 2 and AI SDK 7.

## 2. Mount the server hook

```ts
// src/hooks.server.ts
import { aide } from 'svelte-chat-aide/server';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { env } from '$env/dynamic/private';

export const handle = aide({
	provider: { name: 'anthropic', apiKey: ANTHROPIC_API_KEY, model: 'claude-haiku-4-5' },
	origin: env.ORIGIN // e.g. https://example.com
});
```

`aide(config)` is a SvelteKit `Handle`. Beside an existing one, compose it:

```ts
import { sequence } from '@sveltejs/kit/hooks';
export const handle = sequence(aide(config), myHandle);
```

The hook answers four paths and passes everything else to `resolve`:

| path | answer |
|---|---|
| `endpoint` (default `/api/chat`) | `GET ?route=` warm-up, `POST` chat turn, anything else `405` |
| `/llms.txt`, `/llms-full.txt` | generated from the site map ([llms.txt](llms-txt.md)) |
| `<route>.md` | the markdown of one mapped page |

For each of them it calls `resolve` first and answers only when the app answers `404`, so it
never shadows a route of yours. If the app answers the endpoint path with anything but a `404`,
the hook logs one warning at that first request (a hook cannot see the app's routes at creation,
so the warning cannot come earlier) and leaves the app's answer alone. Set `endpoint` to a free
path in that case, and pass the same path to the widget.

Because the app is asked first, SvelteKit's default `handleError` logs a line such as
`[404] GET /api/chat` for every warm-up and chat request, and `[404] GET /llms.txt` (or
`/sitemap.xml`, `<route>.md`) for the library's own reads of files the site does not have.
These are expected. To silence them, return early in your `handleError` for `404`s whose
`event.url.pathname` is the endpoint, one of the `llms` paths or ends in `.md`.

### `origin`

Set `origin` to the site's public origin (`https://example.com`, no path). The library never
takes the origin from the request, because the `Host` header is the requester's to forge and a
forged one would let a single request fill the shared page cache with another site's text. On
`adapter-node` pass the same `ORIGIN` you give the adapter.

With `origin`, reads go through the app in process and fall back to the network against
`origin` for what the app cannot render in process (prerendered pages served as static files);
`/sitemap.xml` `<loc>`s and absolute links in your `llms.txt` are understood.
Without it, see [Deployment → without `origin`](deployment.md#without-origin).

### Choosing the provider per deployment

```ts
import { aide, fromEnv } from 'svelte-chat-aide/server';
import { env } from '$env/dynamic/private';

export const handle = aide({ provider: fromEnv(env), origin: env.ORIGIN });
```

with `SVELTE_CHAT_AIDE_PROVIDER`, `SVELTE_CHAT_AIDE_MODEL` and `SVELTE_CHAT_AIDE_API_KEY` set.
The library reads no environment variable itself; `fromEnv` reads only the object you hand it.
See [Providers → fromEnv](providers.md#fromenv).

## 3. Add the widget

```svelte
<!-- src/routes/+layout.svelte -->
<script>
	import { ChatWidget } from 'svelte-chat-aide'; // the shadcn theme
	let { children } = $props();
</script>

{@render children()}
<ChatWidget />
```

No Tailwind config and no `@source` line: the theme ships its own precompiled stylesheet. See
[Theming](theming.md) for props, the plain and headless layers and CSP.

## 4. Verify

- Open the site, open the chat, ask about a page you never told it about.
- `curl https://your-site/llms.txt` lists the mapped pages.
- A config error throws when the hook is created, naming the path (`provider.apiKey: is
  required…`). A missing adapter package is found asynchronously; a smoke test can await it:

  ```ts
  import { handle } from '../src/hooks.server';
  await handle.handler.ready; // rejects with "Run: pnpm add @ai-sdk/…" when the adapter is missing
  ```

## What happens at run time

1. The widget opens and sends `GET /api/chat?route=/current/path`. The server reads that page
   (anonymously, see [Security](security.md#reads-of-your-site)), starts the site-map crawl in
   the background and answers with suggestions, whether it wants the page's DOM text, the
   provider's display name for the disclosure line, and the limits the widget trims its thread to.
2. Each message is a `POST`. The first one waits at most `limits.crawlBudgetMs` (1.5 s) for the
   crawl; if it is not done the model is told the outline is partial.
3. The answer streams back as the AI SDK's UI message stream.

The crawl starts only on a request to the endpoint or to one of the `llms` paths, never on an
ordinary page view.

## Mounting by hand

The hook is the recommended mount. If you mount the handlers as routes yourself:

```ts
// src/lib/server/chat.ts — one handler, so one site map and one cache
import { createChatHandler } from 'svelte-chat-aide/server';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { env } from '$env/dynamic/private';

export const chat = createChatHandler({
	provider: { name: 'anthropic', apiKey: ANTHROPIC_API_KEY, model: 'claude-haiku-4-5' },
	origin: env.ORIGIN // required in practice for a hand-mounted handler, see below
});
```

```ts
// src/routes/api/chat/+server.ts
import { chat } from '$lib/server/chat';
export const GET = chat;
export const POST = chat;
```

```ts
// src/routes/llms.txt/+server.ts
import { llmsTxt } from 'svelte-chat-aide/llms';
import { chat } from '$lib/server/chat';
export const GET = llmsTxt(chat);
```

`llmsFullTxt(chat)` and `pageMarkdown(chat)` work the same way.

A handler mounted this way **never reads your pages in process**: an in-process read would go
through the visitor's own request, and SvelteKit copies each such read's `Set-Cookie` onto the
visitor's response. So it reads over the network against `origin`. Without `origin` it logs a
warning and cannot read the site at all (the chat still answers, without page context or
outline). Hand-mounted `llms` routes must let the library's own reads through: requests carrying
the `x-aide-internal` header are answered `404`, which the exported handlers already do.
