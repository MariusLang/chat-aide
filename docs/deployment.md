# Deployment

## origin

Set `origin` to the site's public origin. It decides which host the library may read, which
`Origin` header the endpoint accepts, and which absolute links (sitemap `<loc>`s, links in your
`llms.txt`, redirects) count as the same site. It is never taken from the request: `event.url.origin`
comes from the `Host` header, which the requester chooses, and trusting it would let one request
with a forged `Host` fill the shared page cache with another site's text.

On `adapter-node`, pass the value you give the adapter as `ORIGIN`:

```ts
import { env } from '$env/dynamic/private';
export const handle = aide({ provider, origin: env.ORIGIN });
```

In development set it to the dev server (`http://localhost:5173`) or leave it unset.

**With `origin`** (and the `aide()` hook), reads go through the app in process using the request's
`event.fetch`, but only when `event.url.origin` equals `origin`; a request whose URL says otherwise
(a forged `Host`) is not used, and the reads go over the network to `origin` instead. A page the
app answers `404` in process — a prerendered page the adapter serves as a static file — is read
over the network from `origin`.

### Without origin

Without `origin`:

- reads are **in process only**, and must be answered by the app through the hook (the hook stamps
  its answers to the library's reads with an internal `x-aide-served` header; any read answered
  another way is refused). SvelteKit answers some in-process fetches by going to the network
  against the request's `Host`, which is exactly what must not be trusted;
- prerendered pages served as static files are therefore not read, nor anything else outside the
  app's handler;
- `/sitemap.xml` `<loc>`s (absolute URLs) cannot be verified as this site and are ignored, as are
  absolute links in your `llms.txt`; relative links still work;
- the endpoint accepts only requests with `Sec-Fetch-Site: same-origin`.

The chat works, but set `origin` in production.

## Mounting

`aide()` is the recommended mount. A `createChatHandler` or `llms` handler mounted directly as a
`+server.ts` reads your pages over the network against `origin`, never in process (an in-process
read through the visitor's request would copy the read's `Set-Cookie` onto the visitor's response).
Without `origin` such a handler warns once and cannot read the site.

## Serverless

The crawl, stale-while-revalidate refreshes and your callbacks outlive the response. Each is handed
to a `waitUntil`, found per request in this order:

1. `event.platform.context.waitUntil` (Cloudflare, Netlify);
2. `waitUntil` from `@vercel/functions`, when that optional peer is installed and a Vercel request
   context is live (`pnpm add @vercel/functions` on Vercel);
3. `config.waitUntil`;
4. an unawaited promise: correct on a long-lived Node process, may be cut short on serverless.

On a platform that looks serverless (from `event.platform` or a live Vercel context) with none of
1–3 available, the first request logs a warning. Pass your platform's function as `waitUntil`.

## Shared Store

The default store is in memory and correct for **one long-lived process**. With several instances,
or cold starts, each instance keeps its own rate limits, budgets, page cache and site map: limits
multiply by the instance count and every cold start re-crawls. Pass a shared `Store` and a shared
`salt` (the schema refuses one without the other):

```ts
import type { Store } from '@chat-aide/sveltekit/server';
import Redis from 'ioredis';

const redis = new Redis(env.REDIS_URL);
const store: Store = {
	async incr(key, by, ttlSeconds) {
		const n = await redis.incrby(key, by);
		if (n === by) await redis.expire(key, ttlSeconds); // TTL fixed from the first write
		return n;
	},
	get: (key) => redis.get(key),
	async set(key, value, ttlSeconds) {
		await redis.set(key, value, 'EX', ttlSeconds);
	}
};

export const handle = aide({ provider, origin: env.ORIGIN, store, salt: env.AIDE_SALT });
```

What the library keeps in it: rate-limit counters (`aide:rl:*`, one window), day token counters
(`aide:tok:*`, a UTC day plus a minute), pages (`aide:page:*`, kept `2 × cache.ttlSeconds`) and
misses (`aide:miss:*`, 60 s).

The interface has no delete, so the store cannot evict: the per-instance cache is an LRU of
`maxPages` pages and `maxPages` misses, but entries in a shared store live until their TTL.
Misses for invented routes expire after 60 seconds; how many can be written is bounded by the rate
limit, since each costs a request. A failing store degrades to the in-memory cache for pages.
The serverless warning above also fires, on the first request, when no `store` is configured.

## Vercel

Use `@sveltejs/adapter-vercel` and `pnpm add @vercel/functions`, and set `origin`, `store` and
`salt`. Two things differ from a Node server:

- **Import the provider's adapter by name.** The library loads it with a dynamic `import()`, which
  Vercel's file tracing cannot follow, so without this the function has no adapter and every chat
  request fails. Add the adapter to your dependencies and pass an importer:

  ```ts
  export const handle = aide(config, {
  	importer: async (pkg) => {
  		if (pkg === '@ai-sdk/anthropic') return import('@ai-sdk/anthropic');
  		throw new Error(`no adapter for ${pkg}`);
  	}
  });
  ```

- **Keep the chat off preview deployments.** `origin` points at production, so a preview would
  read production's pages and refuse requests from its own URL. Set the provider's variables for
  the production environment only.

A shared store must fail closed: when `incr` throws, the request is refused before any model call.

## Crawl cost

Every crawled page is a full server render — `load` functions and database queries included — so
the crawl costs up to `limits.maxPages` renders per `cache.ttlSeconds` **per instance** (per cold
start on serverless). To bring it down:

- `pages.exclude` for sections the chat does not need (`/admin/**`, `/search/**`, paginated
  archives);
- a lower `limits.maxPages`;
- a longer `cache.ttlSeconds`;
- a shared `Store`, so the pages are read once and shared by every instance;
- your own `/llms.txt` (and `.md` twins or `/llms-full.txt`), which give a complete outline before
  any page is rendered ([llms.txt](llms-txt.md));
- `pages.source`, which replaces the crawl.

The crawl starts only on a request to the chat endpoint or one of the `llms` paths (those count
against the visitor's warm-up bucket), never on an ordinary page view, and is bounded by
`crawlConcurrency` reads in flight.

## Behind a proxy

See [Security → behind a proxy](security.md#behind-a-proxy): configure your adapter's client
address header or pass `clientKey`, or every visitor shares the proxy's rate-limit bucket.

## Warnings

The library logs only these, each once, prefixed `[chat-aide]`:

- the app answers the chat endpoint itself (at the first such request);
- a handler mounted directly with no `origin` configured (at its first request);
- a serverless platform with no `waitUntil` found (first request);
- a serverless platform with no `store` configured (first request).

## Untested adapters

Verified in this repository: `adapter-node` (the demo app). Not measured yet, on Vercel, Netlify
and Cloudflare: whether prerendered routes are reachable in process or only over the network
against `origin`, whether `event.fetch` stays usable after its response has closed (the
background crawl relies on it; with `origin` set, reads fall back to the network), and how
reliably a serverless platform is detected for the warnings above. Setting `origin`, `store`,
`salt` and, where not detected, `waitUntil` is the safe configuration on any of them.
