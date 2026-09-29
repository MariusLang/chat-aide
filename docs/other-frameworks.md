# Other frameworks

The server is framework-neutral. `createAide` from `@chat-aide/core` returns handlers of a
web-standard `Request` that resolve to a `Response`, which every modern framework can mount: Astro,
React Router (and Remix), Hono, Nuxt, Bun, Deno and plain Node servers that speak `fetch`.

```sh
pnpm add @chat-aide/core
```

```ts
import { createAide, fromEnv } from '@chat-aide/core';

export const aide = createAide({
	provider: fromEnv(process.env),
	origin: 'https://example.com' // required: the site is read over the network from it
});

aide.chat;        // GET warm-up and POST turns, at config.endpoint (default /api/chat)
aide.llmsTxt;     // /llms.txt
aide.llmsFullTxt; // /llms-full.txt
aide.pageMarkdown; // <route>.md, by the request's pathname
aide.fetch;       // all four by pathname, 404 for anything else
```

Each handler is `(request, ctx?) => Promise<Response>`. `ctx.clientAddress` is the visitor's
address for the rate limit: pass it when your framework knows it. Otherwise `x-real-ip`, else the
last `x-forwarded-for` entry is used; see [Next.js → rate limits](nextjs.md#rate-limits-behind-a-proxy)
for when those can be trusted.

Create the handler once per server process, not per request, so there is one site map and one
cache. If your build step evaluates server modules without the run-time environment, create it
lazily on the first request.

## Astro

With an SSR adapter (`output: 'server'`, or a server-rendered route):

```ts
// src/pages/api/chat.ts
import type { APIRoute } from 'astro';
import { aide } from '../../lib/aide';

export const GET: APIRoute = ({ request, clientAddress }) => aide.chat(request, { clientAddress });
export const POST: APIRoute = ({ request, clientAddress }) => aide.chat(request, { clientAddress });
```

```ts
// src/pages/llms.txt.ts
import type { APIRoute } from 'astro';
import { aide } from '../lib/aide';

export const GET: APIRoute = ({ request, clientAddress }) => aide.llmsTxt(request, { clientAddress });
```

For the widget, use the React one as an island (`@astrojs/react`):
`<Chat client:load />` around `<ChatWidget />` from `@chat-aide/react`.

## React Router and Remix

```ts
// app/routes/api.chat.ts
import { aide } from '~/lib/aide.server';

export const loader = ({ request }: { request: Request }) => aide.chat(request);
export const action = ({ request }: { request: Request }) => aide.chat(request);
```

The widget is `@chat-aide/react`; pass `navigate={useNavigate()}` and
`pathname={useLocation().pathname}`.

## Hono

```ts
import { Hono } from 'hono';
import { aide } from './aide';

const app = new Hono();
app.all('/api/chat', (c) => aide.chat(c.req.raw));
app.get('/llms.txt', (c) => aide.llmsTxt(c.req.raw));
app.get('/llms-full.txt', (c) => aide.llmsFullTxt(c.req.raw));
```

## Nuxt (server side)

```ts
// server/api/chat.ts
import { aide } from '../utils/aide';

export default defineEventHandler((event) =>
	aide.chat(toWebRequest(event), { clientAddress: getRequestIP(event, { xForwardedFor: true }) })
);
```

There is no Vue widget yet. The widget protocol is small (a `GET ?route=` warm-up and the AI SDK's
UI message stream), and `@chat-aide/core/client` has everything a widget needs apart from rendering.

## Bun and plain servers

```ts
Bun.serve({
	fetch: (request, server) => aide.fetch(request, { clientAddress: server.requestIP(request)?.address })
});
```

## What differs from SvelteKit

- **Reads go over the network.** The SvelteKit hook can pass the library's own reads of your pages
  through the app in process. Elsewhere they go to `origin` over HTTP, anonymously, with the
  `x-aide-internal` header. The `llms` handlers answer such requests with `404`, so the library
  never reads its own output. Everything else, including the security rules, is the same
  ([Security → reads of your site](security.md#reads-of-your-site)).
- **Background work.** On a long-lived server nothing is needed. On serverless, pass the
  platform's `waitUntil` as `config.waitUntil`, or `ctx.platform = { context: { waitUntil } }`
  per request, and a shared `store` ([Deployment](deployment.md#serverless)).
- **`origin` is required**, and `createAide` throws without it.
