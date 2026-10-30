# @chat-aide/sveltekit — an AI chat for your own SvelteKit site

**Status:** specification, v0.2, 2026-09-26 (v0.1 revised after review). This file is the seed of a new repository; it is
kept here until that repository exists, and `docs/plans/M17-site-chat.md` is the milestone
that consumes it. The npm name `@chat-aide/sveltekit` was free on 2026-09-26; registering it is the first step of L1.

## 1. What it is

A SvelteKit library that gives a site a chat assistant that knows the site: the page the
visitor is reading, a map of every other page it read for itself, and whatever the site's developer wrote
about the product and about how the assistant should speak. It is the "Ask AI" widget of a
documentation site, packaged so that another SvelteKit site gets it by installing one package,
adding two lines and setting one provider key.

The developer:

1. installs `@chat-aide/sveltekit`,
2. mounts the server handler on one route and passes it a provider and a key,
3. drops `<ChatWidget />` into the root layout.

There is no fourth step. The library reads the site's pages by itself, at run time, from the
running app: nothing is generated, indexed or committed by the developer. Everything else is
defaults. Every default can be replaced: the system prompt, the tone, the
provider, the model, the theme, the position, the strings, the storage of the thread, the
limits.

## 2. What it is not

- Not a hosted service. There is no @chat-aide/sveltekit backend, no account, no telemetry to its author.
  The only network calls are from the visitor's browser to the site's own server and from the
  site's server to the provider the developer chose (plus, for prerendered routes the app
  cannot render in process, reads of the site's own configured origin, §3.4).
- Not a Vercel product. The Vercel AI SDK (`ai`, `@ai-sdk/*`) is used as a client library for
  streaming and provider adapters. **No request is routed through Vercel's AI Gateway**, no
  `AI_GATEWAY_API_KEY` is read, and SDK telemetry is switched off explicitly on every call,
  even when the host app has registered a telemetry integration (§4.1). Tests hold this (§9).
- Not a RAG platform. The site map is the site's own pages, read from the running app at run
  time and cached in memory; there is no vector database, no embedding call, no build step and
  no crawler of other hosts.
- Not a general agent. The model has one tool, `read_page`, which reads one page of this site
  through the site's own request handler and never fetches a foreign URL.
- Not a store. The library persists nothing on the server. The thread lives in the visitor's
  `sessionStorage` (opt-out) and in whatever the developer's callbacks do with it.
- Not for static sites. The library is a server `Handle`; a site built with `adapter-static`
  has no server at run time and cannot host it. Prerendered routes inside a server-backed
  app are supported (§3.4).

## 3. Requirements

### 3.1 Installation and wiring

- `pnpm add @chat-aide/sveltekit` is the whole install. `ai` and every adapter of §3.2 are
  regular dependencies of the package, so no provider needs a second install; peer
  dependencies are only `svelte ^5` and `@sveltejs/kit ^2` (and `@vercel/functions`, optional,
  for `waitUntil` on Vercel). The adapters are server-only and loaded on demand, so they never
  reach a browser bundle; the cost is install size (about 50 MB of server dependencies).
- Server: one line in `hooks.server.ts`.

  ```ts
  // src/hooks.server.ts
  import { aide } from '@chat-aide/sveltekit/server';
  import { ANTHROPIC_API_KEY } from '$env/static/private';

  export const handle = aide({
    provider: { name: 'anthropic', apiKey: ANTHROPIC_API_KEY, model: 'claude-haiku-4-5' },
  });
  ```

  `aide(config)` is a SvelteKit `Handle` (compose it with `sequence()` beside an existing
  one). A site that picks its provider per deployment writes `provider: fromEnv(env)` instead
  and sets `CHAT_AIDE_PROVIDER`, `_MODEL` and `_API_KEY` (§3.2). It answers four paths itself and passes everything else through: the chat endpoint
  (`endpoint`, default `/api/chat`), `/llms.txt`, `/llms-full.txt` and `<route>.md` for every
  mapped page — all rendered at request time from the site map of §3.4, cached in memory,
  never written to disk. So a site that adds this one line has a chat *and* an `llms.txt`,
  and nothing was generated. The hook never shadows a route the app answers itself: for the
  endpoint and the three `llms` paths it calls `resolve` first and answers only on a `404`,
  and at handler creation it warns when the app's manifest has a route at `endpoint`.
  Requests the library makes to the site itself (§3.4) carry an internal marker and pass
  straight to `resolve`, so the hook never answers its own reads. A developer who wants an explicit route instead mounts
  `createChatHandler(config)` as a `+server.ts` and the `llms` handlers of §3.4 the same
  way; the hook is the same functions, mounted for them.
- Client: one component in `+layout.svelte`.

  ```svelte
  <script>
    import { ChatWidget } from '@chat-aide/sveltekit/themes/shadcn';
  </script>
  <ChatWidget />
  ```

  The shadcn theme is the default because the target is a SvelteKit site, and shadcn-svelte is
  the component system those sites use. It follows the host's shadcn-svelte variables when they
  are there and falls back to its own values when they are not, and it ships its styles
  precompiled, so the host adds no Tailwind `@source` and no config (§3.9).
- Nothing else. The handler discovers the site's pages and reads their content itself (§3.4).
  A site with thousands of pages, or content the running app cannot render, may hand the
  handler a `pages.source` instead; that is the exception, never the default.

### 3.2 Providers

**Every language-model provider the Vercel AI SDK has an adapter for is a `provider.name`.**
The library keeps one registry, `src/lib/server/providers.ts`: name, adapter package, factory,
the credential shape the factory takes, and whether prompt caching needs a marker. The
adapter is loaded by dynamic `import()` when the handler is created, so only the named one is
ever loaded; every adapter is a dependency of the package, and a missing one (a pruned
install) rejects with the exact `pnpm add` line. The registry is the one place a provider is spelled, and a test walks it.

Official adapters (`@ai-sdk/*`), keyed by name:

| `provider.name` | adapter | credential |
|---|---|---|
| `anthropic` | `@ai-sdk/anthropic` | `apiKey` |
| `openai` | `@ai-sdk/openai` | `apiKey` |
| `azure` | `@ai-sdk/azure` | `apiKey`, `resourceName` or `baseURL` |
| `google` (alias `gemini`) | `@ai-sdk/google` | `apiKey` |
| `google-vertex` | `@ai-sdk/google-vertex` | `project`, `location`, ADC or `credentials` |
| `amazon-bedrock` | `@ai-sdk/amazon-bedrock` | `region`, `accessKeyId`/`secretAccessKey` or the default chain |
| `mistral` | `@ai-sdk/mistral` | `apiKey` |
| `xai` | `@ai-sdk/xai` | `apiKey` |
| `groq` | `@ai-sdk/groq` | `apiKey` |
| `deepseek` | `@ai-sdk/deepseek` | `apiKey` |
| `cohere` | `@ai-sdk/cohere` | `apiKey` |
| `togetherai` | `@ai-sdk/togetherai` | `apiKey` |
| `fireworks` | `@ai-sdk/fireworks` | `apiKey` |
| `deepinfra` | `@ai-sdk/deepinfra` | `apiKey` |
| `cerebras` | `@ai-sdk/cerebras` | `apiKey` |
| `perplexity` | `@ai-sdk/perplexity` | `apiKey` |
| `baseten` | `@ai-sdk/baseten` | `apiKey` |
| `huggingface` | `@ai-sdk/huggingface` | `apiKey` |

Community and compatible, keyed by name:

| `provider.name` | adapter | notes |
|---|---|---|
| `openrouter` | `@openrouter/ai-sdk-provider` | `provider.routing` passes OpenRouter's provider preferences (`data_collection`, `order`, `allow_fallbacks`) through |
| `kimi` (alias `moonshot`) | `@ai-sdk/openai-compatible` at `https://api.moonshot.ai/v1` | preset |
| `ollama` | `@ai-sdk/openai-compatible` at `http://localhost:11434/v1` | preset; local, no key |
| `lmstudio` | `@ai-sdk/openai-compatible` at `http://localhost:1234/v1` | preset; local, no key |
| `nvidia-nim` | `@ai-sdk/openai-compatible` at `https://integrate.api.nvidia.com/v1` | preset |
| `openai-compatible` | `@ai-sdk/openai-compatible` | any OpenAI-shaped endpoint: `baseURL` required, `apiKey` optional, `headers` optional |
| `custom` | none | any `LanguageModel` instance the developer constructs from any adapter, community ones included |

`openai-compatible` and `custom` are what keeps the list complete: an adapter the registry
does not name yet, or a community adapter, is one factory call in the developer's own code
handed in as `custom`. A new official adapter is one row in the registry and one row in its
test. The AI SDK's image, speech and transcription adapters (Fal, Luma, ElevenLabs,
AssemblyAI, Deepgram) are not language models and have no row.

**Not supported, by design:** `@ai-sdk/gateway` / Vercel AI Gateway. It is not in the registry,
the registry test asserts it is not, and a `provider.name` of `gateway` is refused by the
config schema with a sentence saying why.

Rules:

- The handler always passes the SDK a **provider instance's model object**, never a bare
  model-id string. In AI SDK 7 the global default provider *is* Vercel AI Gateway, so a bare
  string (`'anthropic/claude-…'`) is a request to Vercel; that path must not exist in this
  library, and the library never sets or reads `globalThis.AI_SDK_DEFAULT_PROVIDER`. A unit test walks the registry
  and asserts the model handed to `streamText` is an object with a `provider` field, for
  every name.
- Credentials are plain values the developer passes. The library reads no environment
  variable itself, so it works in every runtime SvelteKit supports and never guesses a name.
  Bedrock and Vertex accept their SDKs' default credential chains when nothing is passed, as
  their adapters do.
- **`fromEnv(env)`** is the way to choose the provider per deployment without touching code.
  The developer hands it the environment object of their runtime (`$env/dynamic/private`,
  `process.env`, `platform.env`) and it reads, from that object and nowhere else:

  | variable | maps to | required |
  |---|---|---|
  | `CHAT_AIDE_PROVIDER` | `provider.name` | yes |
  | `CHAT_AIDE_MODEL` | `provider.model` | yes |
  | `CHAT_AIDE_API_KEY` | `provider.apiKey` | for every key-based provider |
  | `CHAT_AIDE_BASE_URL` | `provider.baseURL` | for `openai-compatible`; optional elsewhere |
  | `CHAT_AIDE_REGION` | `provider.region` | `amazon-bedrock` |
  | `CHAT_AIDE_PROJECT`, `CHAT_AIDE_LOCATION` | `provider.project`, `provider.location` | `google-vertex` |
  | `CHAT_AIDE_RESOURCE_NAME` | `provider.resourceName` | `azure` |
  | `CHAT_AIDE_OPTIONS` | `provider.options`, parsed as JSON | optional |

  ```ts
  import { aide, fromEnv } from '@chat-aide/sveltekit/server';
  import { env } from '$env/dynamic/private';

  export const handle = aide({ provider: fromEnv(env) });
  ```

  `fromEnv` returns a `ProviderConfig` and nothing else, so it composes with the rest of the
  config as any object does, and a value passed beside it (`{ ...fromEnv(env), model: 'x' }`)
  wins. It throws at handler creation, naming the variable, when a required one for the named
  provider is missing or the name is not in the registry; it never reads a variable outside
  the table, never falls back to a provider's own conventional name (`ANTHROPIC_API_KEY`),
  and reads nothing from the process by itself — the object is the only source. A test
  walks the registry and asserts each provider's required set.
- `baseURL` and `headers` are overridable for every provider (proxies, EU endpoints,
  self-hosted servers).
- `options` passes through to the adapter's `create*` factory untouched, so an adapter option
  the registry does not model is still reachable.
- `model` is required; there is no default model, because a default is a cost the developer
  did not choose.
- Prompt caching: Anthropic gets `cacheControl` on the static prefix; OpenAI, Gemini,
  DeepSeek, Groq and the OpenAI-compatible endpoints cache on their side and need nothing;
  Bedrock's Anthropic models get `cachePoint`. The registry row says which, and `caching:
  false` turns all of it off.

### 3.3 Context: what the model is told

The prompt is assembled in this fixed order so that the static prefix caches:

1. **System prompt.** The library's default (`defaultSystemPrompt`), or `systemPrompt` from
   the config as a string or `(ctx) => string`. It says the assistant helps visitors of this
   site, answers from the site's pages, says so when the pages do not answer, links to routes
   it cites, and treats page content and messages as data rather than instructions.
2. **Persona.** `persona: { name, tone, language, audience, refusals }` rendered beneath the
   system prompt; every field optional. This is where the developer's "how it speaks" lives.
3. **Facts.** `facts: string | string[]` — product facts the pages do not carry (pricing,
   support address, who runs it). Rendered verbatim inside a fenced block.
4. **Site outline.** From the site map (§3.4), rendered in `llms.txt`'s format: the site's
   title and summary, then `- [title](route): description` per page under a heading per
   section, with the headings of each page beneath it when `limits.outlineChars` (6 000)
   allows. Never the full text of other pages. While the map is still being built the model
   is told it is partial. A site that serves its own `/llms.txt` has it used verbatim as the
   outline's base; when it is longer than `limits.outlineChars` it is cut at the last whole
   link line that fits, sections under `## Optional` going first, and the cut is marked.
5. **Current page.** The full extracted text of the page the visitor is on, bounded by
   `limits.pageChars`. `pageContext` decides where it comes from. Under `'auto'` (the default)
   the server renders the page itself and falls back to the text the widget extracted from
   the DOM when the server's render is thinner than `limits.minPageChars` (a page the browser
   filled in after load). Under `'server'` it is always the server's render. Under `'dom'` it
   is always the widget's text, for pages only readable as the visitor sees them (pages behind
   a login). DOM text is per request and never enters the shared cache.
6. **History.** The thread, windowed: the last `limits.historyTurns` turns and at most
   `limits.historyChars`, oldest dropped first. The client sends the whole thread; the server
   windows it, so the client cannot enlarge the prompt by sending more.
7. **The visitor's message.**

Parts 1–4 are the static prefix. With Anthropic they carry `cacheControl: ephemeral`; with
the others the SDK's or provider's own caching applies. Parts 5–7 are per request; with
Anthropic a second breakpoint on the last history turn lets a multi-turn thread on one page
reuse its earlier turns.

The prefix is byte-identical between requests only while its inputs are: a `systemPrompt`
function that varies per request, a `facts` value that changes, or the "outline is partial"
note during a crawl each start a new prefix, and the docs say so. Providers cache only a
prefix above their minimum length (Anthropic's minimum is model-specific and larger for its
small models), so a small site's prefix may not cache at all; the library does not pad it.

One tool, `read_page({ route })`, returns the full text of one page of this site, bounded by
`limits.pageChars`, from the cache or by rendering it on the spot (§3.4).
`stopWhen: isStepCount(limits.maxSteps)` (default 3) bounds the loop. The tool accepts a
same-site pathname and nothing else, checked by the route rule of §3.6: the model's input is
the visitor's to steer, so the tool's argument is treated as hostile.

### 3.4 The site map: derived at run time, never generated

The handler needs two things it does not have: the text of the page the visitor is on, and a
map of every other page. Both come from the running app, on demand, and are cached in
memory. No CLI, no Vite plugin, no committed file, no build step.

**Reading one page.** `readPage(route)` renders the route through the app's own request
handler: SvelteKit's server-side `fetch` with a relative URL is dispatched to the app in
process, without a network hop, and returns the same HTML a visitor would get. The HTML is
parsed with `linkedom` on the server and reduced by the extractor. The result — title,
description, headings, text, a content hash — is cached under the route for
`cache.ttlSeconds` (3600) and served stale while a refresh runs in the background.

Every read the library makes carries **no cookie and no header of the visitor's request**: it
is an anonymous request to the site, so nothing personalised, and nothing behind a login,
ever enters a cache other visitors read from. SvelteKit's server `fetch` forwards the
visitor's `cookie` and `authorization` to same-origin URLs by default, so every read passes
`credentials: 'omit'` and a fresh `Headers` holding only `accept` and the internal marker
(a random per-process value in `x-aide-internal`, which the hook sees and passes to `resolve`,
§3.1). The library uses the event's `fetch` only as the in-process transport; it reads nothing
else from the event that happened to start a read.

Every read passes `redirect: 'manual'`. A `3xx` is followed only when its `Location`, resolved
against the origin, passes the route rule of §3.6 (same origin, normalized, not excluded), at
most 3 hops; any other redirect ends the read as unreadable. So a same-site path that
redirects elsewhere (`/go/github`, an open redirect) never turns into a read of a foreign or
internal host.

**What is cached.** Only a `200` answer with an HTML or markdown content type is cached as a
page. Anything else — `404`, `5xx`, a redirect that was not followed, another content type — is
remembered as a miss for 60 seconds without its body, so repeated asks for a missing route
cost one render per minute, not one per ask. The cache as a whole, crawled pages and on-demand
reads together, holds at most `limits.maxPages` entries and evicts the least recently used, so
a stream of invented routes cannot grow it, in memory or in a shared `Store`.

**The origin is configured, never taken from the request.** Where the adapter serves a
prerendered route as a static file outside the handler, the read falls back to the network,
and every same-origin decision (sitemap `<loc>`s, crawled links, `read_page` routes) is made
against one origin. That origin is `config.origin`, else the adapter's `ORIGIN` when the
developer passes it in, and never `event.url.origin`: that value comes from the request's
`Host` header, and taking it would let one request with a forged `Host` fill the shared cache
with another site's text. Without a configured origin the library reads in process only, and
a route the in-process read cannot reach is marked unreadable rather than fetched.

**Background work.** The crawl, stale-while-revalidate refreshes and the server callbacks
(§3.7) outlive the response. The handler hands each such promise to `waitUntil`: the
platform's own when the adapter exposes one (`event.platform.context.waitUntil` on Cloudflare
and Netlify, `@vercel/functions` on Vercel), else `config.waitUntil`, else a plain unawaited
promise, which is correct on a long-lived Node process and may be cut short on a serverless
one; handler creation warns once in that case.

**Discovering the pages.** The map is a bounded, same-site crawl through the same `readPage`:

1. seeds: `/`, `/sitemap.xml` if the site has one (every `<loc>` on the same origin), and
   `config.pages.include`;
2. from each page read, every `<a href>` that resolves to the same origin, is not excluded
   by `config.pages.exclude`, and is not `rel="nofollow"`, reduced to its pathname: query
   and hash are dropped, so `?page=2`, `?sort=` and `?t=<token>` never become distinct pages;
   default excludes are `/api/**`, anything with a file extension, and paths whose last
   segment is `logout`, `logoff`, `signout`, `sign-out`, `unsubscribe`, `delete` or `remove`,
   since a GET there may act;
3. breadth first, at most `limits.maxPages` (200) pages and `limits.crawlConcurrency` (4)
   reads in flight, revisited when a page's TTL lapses.

The crawl starts on the first request to the chat endpoint (the `GET` warm-up or a message),
not on the first request to the site, so bots on ordinary pages do not trigger it. It runs in
the background under `waitUntil`; the first answer waits at most `limits.crawlBudgetMs` (1500)
for it and is otherwise told the outline is partial. Later requests find it complete. Nothing
is written to disk.

Every crawled page is a full server render, so a crawl costs the site up to `maxPages`
renders — database queries and `load` functions included — per TTL per instance; the docs
say so and point at `pages.exclude`, `limits.maxPages` and a longer `cache.ttlSeconds`. Every
process keeps its own cache, and a serverless platform re-crawls on each cold start; a
deployment with several instances or with cold starts passes a shared `Store` (§3.5) so the
map is built once and read by all.

**The widget's part.** When the window opens the widget sends `GET {endpoint}?route=<path>`.
The server reads the page, answers with the page's suggestions and whether it wants the DOM
(`pageSource: 'server' | 'dom'`), and the crawl warms. From then on each turn carries the
route, and the DOM text only when the server asked for it. On every client-side navigation
(`afterNavigate`) the widget repeats the warm-up for the new route, so an open window never
answers about the page the visitor left.

**Extraction rules** (one module, run by the server on rendered HTML and by the widget on
the live DOM, so the two see the same page): text of `<main>` if present, else `<body>`;
`[data-aide-ignore]` subtrees dropped (the docs tell sites to put it on comments, forum posts
and any other text their visitors write, since that text reaches every visitor's prompt);
`<nav>`, `<aside>`, `<script>`, `<style>`,
`<noscript>`, `<template>` and `[aria-hidden="true"]` dropped; `<header>` and `<footer>`
dropped only as page landmarks (not inside `<main>`, `<article>` or `<section>`), so the
`<article><header><h1>` of a docs or blog page keeps its title; `[data-aide]`
subtrees, when any exist, are the only ones kept; `<title>`, `<meta name="description">` and
`h1–h3` fill the metadata; whitespace collapsed. A page whose extracted text is under
`limits.minPageChars` (200) is kept in the map for its title and marked thin, which is what
makes `'auto'` ask the widget for the DOM.

**`llms.txt`, read and served.** [llms.txt](https://llmstxt.org) is the convention for
exactly the document the outline is: an H1, a one-paragraph summary, and sections of
`- [title](url): description` links, with `/llms-full.txt` for the whole content and a
`.md` twin of a page at `<route>.md` (the root and any route ending in `/` at
`<route>/index.html.md`, as the convention has it). The library speaks it in both directions.
Every read below goes through `readPage`'s transport, so it carries the internal marker and
reaches the app, never the hook's own generated documents: a site's `/llms.txt` is the
site's, and a missing one is a `404`, not the library reading itself back.

- *Reading.* If the site serves `/llms.txt`, it is read first (cookie-less, like every read):
  its summary becomes the site's one-line description in the prompt, its links become the
  crawl's seeds in the order the author gave them, and their descriptions fill the outline
  before any page is rendered — so a site that has an `llms.txt` has a complete outline on
  the first request, with no crawl budget spent. Links under an `## Optional` heading are
  read last. For any page, `readPage` asks for `<route>.md` before the HTML and, when the
  site answers with markdown, uses it as the page's text — cheaper in tokens and cleaner than
  an extraction — and `/llms-full.txt`, when present, is split at its page headings into the
  cache so `read_page` needs no render at all. None of this is required: a site with none of
  these files is crawled as above.
- *Serving.* The `aide()` hook of §3.1 answers `/llms.txt`, `/llms-full.txt` and
  `<route>.md` for every mapped page by itself, rendered at request time from the site map
  in the convention's format — title, summary from `facts` or the root page's description,
  one section per top-level path segment, `pages.exclude` honoured — and cached with the
  map's TTL. Nothing is generated and no file exists: the document is the map, serialised
  when asked for. A site that already serves its own `/llms.txt` keeps it: the hook never
  shadows a route the app answers itself (`llms.serve: false` turns the serving off
  entirely). Pages that came from `pages.source` are not served on these routes unless the
  developer sets `llms.serveSource: true` (below). The same three are exported as handlers (`llmsTxt()`, `llmsFullTxt()`,
  `pageMarkdown()`) from `@chat-aide/sveltekit/llms` for a site that mounts routes by hand. The
  library's own outline is that same text, so what the chat is told about the site and what
  the site tells the world are one document.

**The exception.** `config.pages.source` is an async function returning `{ route, title,
description, headings, text }[]` — for a site whose content lives in a CMS, is too large to
crawl, or cannot be rendered by the app that hosts the chat. When it is set the crawl does
not run, `read_page` reads from it, and the current page still comes from `readPage` or the
DOM. It is the one place a developer may generate something, and it is optional.

A `pages.source` function can return what the site does not publish — drafts, member-only
text, a CMS field meant for staff — so its pages feed the chat and the outline but are **not**
served on `/llms.txt`, `/llms-full.txt` or `<route>.md` by default: publishing them to anyone
who asks is a decision, made with `llms.serveSource: true`. They still reach the model, and
through the model the visitor, so the docs say to return only text any visitor may read.

The map is data the model reads. What the crawl and `readPage` put in it is only what the site
serves to an anonymous visitor, because that is the only way they read. What `pages.source`
puts in it is whatever the developer's function returns.

### 3.5 Cost and tokens

- `limits`: `pageChars` (12 000), `minPageChars` (200), `outlineChars` (6 000), `historyTurns`
  (12), `historyChars` (16 000), `maxOutputTokens` (1 024), `maxSteps` (3), `messageChars`
  (4 000), `messages` (60), `maxPages` (200), `crawlConcurrency` (4), `crawlBudgetMs` (1 500).
  Every number is a config default, spelled once beside its ceiling in
  `src/lib/shared/limits.ts`, and the schema refuses one above its ceiling: `pageChars`
  50 000, `minPageChars` 5 000, `outlineChars` 40 000, `historyTurns` 50, `historyChars`
  100 000, `maxOutputTokens` 8 192, `maxSteps` 8, `messageChars` 20 000, `messages` 200,
  `maxPages` 5 000, `crawlConcurrency` 16, `crawlBudgetMs` 10 000.
- **Every number in this section is the developer's to set.** The values above and the
  rate-limit and budget defaults below are defaults only: each is a field of the config
  (§5), any subset may be passed, and what is not passed keeps its default. The ceilings
  exist to catch a typo (`pageChars: 1200000`), not to overrule the developer: one who means
  it raises a ceiling with `limitCeilings: { pageChars: 200_000 }`, and the schema then
  accepts values up to the new ceiling. Rate limit and budgets have no ceiling, and each is
  switched off with `false`.
- Prompt caching on by default where the provider has it.
- The outline-plus-tool design keeps other pages out of the prompt until asked for.
- `usage` on every response, in AI SDK 7's `LanguageModelUsage` shape, summed over all steps:
  `inputTokens`, `outputTokens`, `totalTokens`, `inputTokenDetails.{noCacheTokens,
  cacheReadTokens, cacheWriteTokens}` and `outputTokenDetails.{textTokens, reasoningTokens}`,
  each `undefined` where the provider does not report it; handed to `onResponse` (§3.7)
  unchanged so the developer can account per model. Budgets charge `inputTokens +
  outputTokens`.
- **Budgets**, enforced in the handler through the `Store`: per visitor per window
  (`rateLimit.requests`, `rateLimit.windowSeconds`, default 20 per 600 s), per visitor per
  day (`budget.tokensPerDay`, default 200 000), and **for the whole site per day**
  (`budget.siteTokensPerDay`, default 5 000 000). The site-wide budget is the one that bounds the developer's
  bill: a per-visitor key is an address, and addresses are cheap to rotate. Refused with
  `429 rate_limited` / `429 budget_exhausted` and a sentence the widget shows.
- Token budgets are charged after a turn, when the provider has reported its usage, and
  checked before the next one. A single turn can therefore overshoot a budget by at most its
  own cost (bounded by the input limits and `maxOutputTokens × maxSteps`); the docs say so.
- **`Store`** is the one interface for every piece of shared state, defined here and nowhere
  else:

  ```ts
  interface Store {
    incr(key: string, by: number, ttlSeconds: number): Promise<number>; // counters: rate limit, budgets
    get(key: string): Promise<string | null>;                           // site map and page cache
    set(key: string, value: string, ttlSeconds: number): Promise<void>;
  }
  ```

  A KV or Redis store is a few lines. The in-memory store is the default and is correct only
  for one long-lived process: on serverless or with several instances each instance counts
  and caches on its own, so rate limits and budgets multiply by the instance count. Handler
  creation warns when it detects a serverless adapter and no `store` was passed.

### 3.6 Security

- **The key never leaves the server.** The `./server` export maps its `browser` condition to
  `server/browser-guard.js`, which imports a specifier that does not exist
  (`@chat-aide/sveltekit/server-only-imported-in-browser`), so a client bundle that imports
  `@chat-aide/sveltekit/server` fails to build with that name in the error. A runtime check that
  throws when `window` is defined backs it up but is not what the test relies on; a test builds
  a client bundle that imports it and asserts the build fails.
- **The endpoint refuses other sites' pages.** `Sec-Fetch-Site` must be `same-origin`, or
  `Origin` must match the configured origin (§3.4); `same-site` is not enough, since sibling
  subdomains may serve content the developer does not control. With no origin configured,
  only `Sec-Fetch-Site: same-origin` is accepted; the check never compares against
  `event.url.origin`. `allowedOrigins` widens it deliberately. Refused `403 origin_refused`. This stops other web pages from spending the
  key through a visitor's browser. It does **not** stop a script: a non-browser client sends
  whatever headers it likes, so the endpoint is callable by anyone who can reach the site.
  What bounds that is the rate limit and the budgets of §3.5, above all
  `budget.siteTokensPerDay`, together with the one tool and the site-scoped system prompt;
  the docs say this plainly.
- **Optional `authorize(event)`** hook: return `false` or a `Response` to refuse (sessions,
  consent cookies, geo rules).
- **Body validated** with zod: message count, chars per message, role set, route by the rule
  below, `dom` text bounded by `pageChars`. Refused `400 invalid_request` with the path that
  failed and nothing else.
- **One route rule, for every route the library touches** — `aide.route` in the body,
  `GET ?route=`, `read_page`'s argument, crawled links, sitemap `<loc>`s, `llms.txt` links and
  redirect targets — in `src/lib/site/route.ts` and nowhere else. A route is accepted only
  when all of these hold:
  1. it is a string of at most 512 characters starting with exactly one `/`: `//host` is a
     protocol-relative URL naming another host and is refused, as is any `\`;
  2. it contains no percent-encoded `/`, `\` or `.` (`%2f`, `%5c`, `%2e`, either case) and
     no control character;
  3. `new URL(route, origin)` parses, and the result's `origin` equals the configured origin
     (or, without one, the in-process sentinel origin the reads use) — never a host, port or
     scheme of the input's choosing;
  4. the result's `pathname` is taken as the route: dot segments resolved, query and hash
     dropped. Excludes and every later check are matched against this normalized pathname,
     so `/docs/../api/x` is `/api/x` and is excluded.
  A refused route is `invalid_request` in the body and "not a page of this site" from
  `read_page`, and no read is made. Only the normalized pathname is ever handed to `fetch`,
  so no read can reach another host, the cloud metadata address or an internal service.
- **DOM text is used only when the server would ask for it.** The server keeps no per-visitor
  state, so it decides again on each request: `dom` is used when `pageContext` is `'dom'`, or
  under `'auto'` when the cached render of that route is thin; otherwise it is dropped
  unread. A forged `dom` reaches only the forger's own conversation.
- **Rate limit** keyed by an HMAC of the client address under a salt; no address is stored
  or logged. The salt is random per process by default, which is right for the in-memory
  store; with a shared `Store` it must be shared too, so `salt` is required when `store` is
  set, and the schema refuses one without the other. A developer who runs behind a proxy
  sets `clientKey(event)` to read the header they trust; the library reads no forwarded
  header by itself. Without it, every visitor behind the proxy shares the proxy's address and
  so one bucket, and one client can use it up for all; handler creation cannot detect a
  proxy, so the docs say this beside `clientKey`. The `GET` warm-up has its own bucket
  (`rateLimit.warmups`, default 60 per 600 s), since each one may render a page.
- **Prompt injection contained.** Page text and messages are placed inside delimited data
  blocks; the system prompt names them as data; the tool can only read this site's pages; there is no
  tool that fetches, writes or navigates. Crawled text can still carry instructions a
  visitor planted (a comment, a forum post) into every other visitor's prompt; the defences
  are `[data-aide-ignore]` on such text (§3.4) and the rules for what an answer may render:
- **What an answer may render.** The widget renders the answer's markdown to DOM nodes,
  never to an HTML string, and nothing in an answer makes the browser send a request
  without a click:
  - **Images are never rendered.** `![alt](url)` and reference-style images become plain
    text of their alt (or nothing when it is empty); no `<img>`, no `srcset`, no CSS
    `url()`, no favicon or link preview is ever created from an answer. An image URL is
    how a planted instruction would carry the conversation, or under `pageContext: 'dom'` a
    logged-in visitor's page, to another host with no click at all.
  - **Links** keep only `http(s)` and same-origin targets. `answerLinks` (default
    `'same-origin'`) decides which survive: under `'same-origin'` a link to another host
    renders as its text alone, so a planted instruction cannot put a phishing link in front
    of every visitor; `'any'` keeps external links, with `rel="noopener noreferrer"` and
    `target="_blank"`. Same-origin links navigate with `goto`.
  - Raw HTML is shown as text; autolinks follow the link rule.
- **Errors are opaque.** A provider failure reaches the client as `502 provider_error` with a
  generic sentence; the provider's message goes to `onError` and nowhere else. Nothing is
  logged by default.
- **CSP-friendly.** No inline scripts; styles are a stylesheet or Tailwind classes, with
  `nonce` accepted for the one style tag the plain theme injects.
- Dependencies pinned by caret within major; `pnpm audit` in CI; no `postinstall` script.

### 3.7 Callbacks

Server side, on the handler config, all optional. None delays the response: each is started
after its event and its promise handed to `waitUntil` (§3.4), so it completes on serverless
platforms too. A rejection or throw is caught and handed to `onError` (and one from `onError`
itself is dropped), never to the visitor:

```ts
onMessage({ sessionId, route, text, at })                      // each visitor message
onResponse({ sessionId, route, text, usage, model, provider, durationMs, finishReason, toolCalls, at })
onRefused({ sessionId, code, at })                              // rate limit, budget, origin, invalid
onError({ sessionId, error, at })
```

`sessionId` is minted by the widget (random, kept in `sessionStorage`) and is the only
identifier; the library attaches nothing else to a visitor. Analytics is the use case: the
developer forwards what they want to whatever they use, and the library sends nothing anywhere.

Client side, on the component: `onopen`, `onclose`, `onsend(text)`, `onresponse(text, usage)`,
`onerror(code)`, and the same as `aide:*` `CustomEvent`s on `window` for tag managers.

### 3.8 The widget

- `<ChatWidget>` composes `<ChatLauncher>` (the floating button) and `<ChatWindow>`. Props:
  `endpoint`, `position` (`bottom-right` default, `bottom-left`, `top-right`, `top-left`),
  `offset` (`{ x, y }`), `mode` (`floating` default, `inline` for a docs column, `sheet` for
  a side panel), `open` (bindable), `enabled` (renders nothing while `false`; for sites that
  gate on consent), `suggestions` (strings, or a map by route), `strings` (every visible
  string, for translation), `disclosure` (the one line under the composer saying where
  messages go, default names the provider), `persistThread` (default `true`, `sessionStorage`),
  `answerLinks` (`'same-origin'` default, or `'any'`; §3.6). `createChat` of the headless
  layer takes the same option, so a custom theme gets the same rendering rules.
- Anywhere-placement: the launcher is a snippet (`{#snippet launcher({ open, toggle })}`), so
  a site puts its own button in its header and `position` is ignored; `<ChatWindow>` also
  mounts alone for an inline column.
- Streaming with `@ai-sdk/svelte`'s `Chat`; the answer renders as it arrives; a stop button
  aborts; a retry resends the last message.
- Keyboard and screen readers: the launcher is a `button` with a label; the window is a
  `dialog` with a focus trap, `Escape` closes, the transcript is `aria-live="polite"`, the
  streaming answer is announced once when it finishes; reduced motion honoured.
- Markdown answers: paragraphs, lists, headings, inline code, fenced code with a copy button
  and a language label, links as §3.6 says; same-origin links navigate with `goto`, so a cited
  `[Privacy](/privacy)` is a working link into the site. No images (§3.6).
- Wraps at 320 px; the window is full-screen under 480 px.
- Empty state: a greeting from `strings.greeting` and up to four `suggestions` for the route.

### 3.9 Themes

Three layers, each importable on its own:

1. **`@chat-aide/sveltekit/headless`** — `createChat(options)` (a runes store: messages, status, send,
   stop, retry, open/close) and unstyled components that render structure with `data-part`
   attributes (`launcher`, `window`, `header`, `transcript`, `message`, `composer`, …) and no
   CSS. A custom theme is these plus a stylesheet, or its own components over the store.
2. **`@chat-aide/sveltekit/themes/plain`** — CSS only, no dependencies, every colour, radius and font a
   `--aide-*` custom property; light and dark from `prefers-color-scheme` and a
   `data-theme` attribute.
3. **`@chat-aide/sveltekit/themes/shadcn`** — the default theme, what `.` re-exports and what the
   reference site uses. Built from shadcn-svelte components and Tailwind 4:
   - *Components.* shadcn-svelte is a CLI that copies component source into a project, not a
     runtime package, so the theme's components (button, textarea, scroll-area, sheet,
     tooltip) are generated with the shadcn-svelte CLI into `themes/shadcn/ui/` and ship as
     part of the package. Their runtime dependencies — `bits-ui`, `tailwind-variants`,
     `tailwind-merge`, `clsx`, `@lucide/svelte` — are regular dependencies, so importing the
     theme resolves in any SvelteKit app. `shadcn-svelte` itself is a dev dependency of the
     package only.
   - *Colours.* Every colour reads the host's shadcn-svelte variables (`--background`,
     `--card`, `--primary`, `--border`, `--ring`, …), each with a fallback
     (`var(--primary, <default>)`), so on a shadcn-svelte site it follows the host's theme,
     light and dark included, and on a site without shadcn-svelte it still renders with the
     theme's own palette. Nothing to configure in either case.
   - *Styles.* The theme's Tailwind classes are compiled at package build time, under
     Tailwind 4's `prefix(aide)`, into one stylesheet the components import. The host's
     Tailwind does not need to scan `node_modules` (no `@source` line), and the theme's
     utilities cannot collide with the host's. A site without Tailwind gets the same styles.

Every theme passes the same Playwright suite (§9), so a theme cannot lose keyboard access.

### 3.10 Privacy

What leaves the browser: the visitor's messages, the route, the `sessionId`, and — when the
server asked for it — the text of the page as the visitor sees it. It goes to the site's own
server and from there to the developer's provider; the library stores none of it. The
disclosure line under the composer says where it goes, and the developer sets it to the
sentence their policy needs. `enabled={false}` until consent is the pattern for sites that
need one; and DOM text is sent only on request and never cached, because a page behind a login is
the visitor's.

## 4. Package layout

```
@chat-aide/sveltekit/
  packages/sveltekit/            the library (svelte-package)
    src/lib/
      server/                   createChatHandler, providers, prompt, window, store, guards
      site/                     extract (shared with the widget), readPage, crawl, cache
      headless/                 createChat, unstyled components
      themes/plain/
      themes/shadcn/            components; ui/ is shadcn-svelte CLI output; styles compiled at build
      shared/                   schemas (zod), limits, strings, markdown-to-nodes, types
    src/routes/                 the package's own dev playground
    tests/                      vitest + Playwright
  apps/demo/                    a SvelteKit site using the shadcn theme; the docs
  docs/
  spec.md                       this file
```

`exports`: `.` (widget, shadcn theme re-export), `./server` (`aide` hook, `createChatHandler`, `fromEnv`), `./headless`, `./themes/plain`,
`./themes/shadcn`, `./llms` (the `llms.txt` handlers) and `./extract` (the extractor, for a
custom widget). No `bin`. Built with
`@sveltejs/package`; `publint` and `svelte-check` in CI.

### 4.1 Dependencies and versions

**The library tracks the latest stable release of every dependency**, and the rule is
mechanical: L1 starts from the versions below, a weekly Renovate run bumps every dependency
to its latest stable and opens one PR that must pass the whole suite, and a prerelease tag
(`next`, `beta`, `rc`) is never used — SvelteKit 3 and Vite's betas are picked up the day
they are `latest`, not before. A major bump that changes an API this spec names updates the
spec in the same PR. Peer ranges are carets on the major (`^7`), never pinned to a minor,
so a consumer on a newer patch is not held back.

Latest stable on npm, 2026-09-26, the floor L1 starts from:

| Dependency | Version | Role |
|---|---|---|
| `ai` | 7.0.116 | core: `streamText`, `convertToModelMessages`, `toUIMessageStream`, `createUIMessageStreamResponse`, `isStepCount`, `tool` |
| `@ai-sdk/svelte` | 5.0.116 | `Chat` in the widget |
| `@ai-sdk/anthropic` | 4.0.65 | adapter (every registry adapter is a dependency; the rest at their latest) |
| `@ai-sdk/openai` | 4.0.78 | adapter |
| `@ai-sdk/openai-compatible` | 3.0.57 | adapter behind the presets |
| `@ai-sdk/google` | 4.0.82 | adapter |
| `@ai-sdk/mistral` | 4.0.52 | adapter |
| `@ai-sdk/amazon-bedrock` | 5.0.97 | adapter |
| `@openrouter/ai-sdk-provider` | 3.1.0 | adapter |
| `svelte` | 5.57.1 | peer |
| `@sveltejs/kit` | 2.70.3 | peer (3 is `next`; adopted when `latest`) |
| `@sveltejs/package` | 2.5.8 | build |
| `@sveltejs/adapter-node` / `adapter-static` | 5.5.7 / 3.0.10 | demo app only |
| `vite` | 8.3.1 | build |
| `tailwindcss` | 4.3.3 | dev dependency: compiles the shadcn theme's stylesheet at package build |
| `shadcn-svelte` | 1.7.0 | dev dependency: the CLI that generates `themes/shadcn/ui/` |
| `bits-ui` | 2.19.3 | dependency of the shadcn theme (with `tailwind-variants`, `tailwind-merge`, `clsx`, `@lucide/svelte` at their latest) |
| `mode-watcher` | 1.1.0 | demo app only |
| `zod` | 4.6.5 | schemas; `ai` 7 accepts zod 4 schemas for `inputSchema` |
| `linkedom` | 0.18.13 | server-side HTML parsing for `readPage`; never in the browser bundle |
| `vitest` | 5.0.2 | tests |
| `@playwright/test` | 1.63.0 | browser tests |
| `publint` / `svelte-check` | 0.3.24 / 4.7.6 | CI |
| `typescript` | 6.0.3 | 7.0.2 is `latest`, but `svelte-check` 4.7.6 (its latest) declares peer `typescript ^5 \|\| ^6` and npm refuses to install it with 7. The library stays on the latest 6.x and moves to 7 in the Renovate PR where `svelte-check` accepts it; this is the one deliberate exception to "latest stable" |
| `eslint` | 10.11.0 | lint |
| Node | 24 LTS (Krypton) | engines `>=24`; CI runs on 24 |
| pnpm | latest 10 | workspace |

AI SDK 7 is what the API names in this spec follow. Checked against the type declarations of
`ai` 7.0.116, `@ai-sdk/anthropic` and `@ai-sdk/amazon-bedrock` (latest) on 2026-09-26:

- `streamText({ instructions })` for the static prefix. `system` is still accepted, as an
  alias; the library uses `instructions`. It takes `string | SystemModelMessage |
  SystemModelMessage[]`, so the prefix is passed as system messages carrying
  `providerOptions.anthropic.cacheControl: { type: 'ephemeral' }` (optional `ttl: '5m' |
  '1h'`), or `providerOptions.bedrock.cachePoint` for Bedrock.
- `stopWhen: isStepCount(n)`. `stepCountIs` is still exported, as an alias.
- `tool({ inputSchema })`, `maxOutputTokens`.
- `onEnd` on `streamText` feeds `onResponse`; `onFinish` is the older name for the same
  callback.
- `result.stream` for the full stream (`fullStream` is deprecated), turned into the response
  with the standalone `toUIMessageStream({ stream })` and `createUIMessageStreamResponse({
  stream })`; `result.toUIMessageStreamResponse()` is deprecated.
- `result.usage` is the total over all steps (`totalUsage` is deprecated), and cache and
  reasoning counts live under `usage.inputTokenDetails` and `usage.outputTokenDetails`
  (§3.5), not at the top level.
- `MockLanguageModelV4` is exported from `ai/test`; `Chat` from `@ai-sdk/svelte` (peer
  `svelte ^5.31`).
- **Telemetry is not off by default.** `TelemetryOptions.isEnabled` is "enabled by default
  when a telemetry integration is registered", and a host app can register one globally
  (`registerTelemetry`, `globalThis.AI_SDK_TELEMETRY_INTEGRATIONS`), which by default also
  records inputs: page text and visitor messages. So leaving `telemetry` unset is not enough.
  Every `streamText` call passes `telemetry: { isEnabled: false }`, and a test registers an
  integration and asserts it records nothing from the library.
- **`@ai-sdk/gateway` is always installed.** `ai` 7 depends on it directly (4.0.94 under
  `ai` 7.0.116), and `globalThis.AI_SDK_DEFAULT_PROVIDER` falls back to it when a bare
  model-id string is used. The library cannot keep the package out of `node_modules`; what
  keeps requests out of it is §3.2's rule that only model objects reach `streamText`, and
  the tests that hold it.

## 5. Configuration

`createChatHandler(config)` takes the whole configuration; a site that wants it in one file
exports the same object from `chat-aide.config.ts` and imports it there. The schema:

```ts
type AideConfig = {
  provider: ProviderConfig;                  // required
  pages?: { include?: string[]; exclude?: string[]; source?: () => Promise<Page[]> };
  llms?: { read?: boolean; preferMarkdown?: boolean; serve?: boolean; serveSource?: boolean };  // true, true, true, false
  endpoint?: string;                         // '/api/chat'
  cache?: { ttlSeconds?: number };
  origin?: string;                           // the site's public origin (§3.4); never read from Host
  waitUntil?: (promise: Promise<unknown>) => void;  // when the platform's is not detected
  systemPrompt?: string | ((ctx: PromptContext) => string);
  persona?: { name?: string; tone?: string; language?: string; audience?: string; refusals?: string[] };
  facts?: string | string[];
  pageContext?: 'server' | 'dom' | 'auto';  // 'auto'
  limits?: Partial<Limits>;                  // defaults in §3.5; any subset
  limitCeilings?: Partial<Limits>;           // raises the typo guard of §3.5 deliberately
  rateLimit?: { requests?: number; windowSeconds?: number; warmups?: number } | false;  // 20 per 600 s; 60 warm-ups  budget?: { tokensPerDay?: number | false; siteTokensPerDay?: number | false } | false;  // 200 000 / 5 000 000
  store?: Store;                             // in-memory; requires `salt` when set
  salt?: string;                             // HMAC salt for client keys, shared across instances
  allowedOrigins?: string[];
  authorize?: (event: RequestEvent) => boolean | Response | Promise<boolean | Response>;
  clientKey?: (event: RequestEvent) => string;
  caching?: boolean;                         // true
  onMessage?; onResponse?; onRefused?; onError?;
};
```

The schema is zod; an invalid config throws at handler creation with the path that failed,
so a misconfiguration fails the build's smoke test rather than a visitor's first message.

## 6. Wire protocol

`POST {endpoint}` with the AI SDK UI message format plus @chat-aide/sveltekit's fields:

```json
{ "id": "…", "messages": [ { "role": "user", "parts": [ { "type": "text", "text": "…" } ] } ],
  "aide": { "route": "/privacy", "sessionId": "…", "dom": null } }
```

Answers stream as the SDK's UI message stream (`createUIMessageStreamResponse({ stream:
toUIMessageStream({ stream: result.stream }) })`, the stateless form AI SDK 7 keeps), so the widget
and any custom client use `@ai-sdk/svelte` or `@ai-sdk/react` unchanged. Refusals are JSON
`{ "error": "<code>", "message": "<sentence>" }` with the status codes of §3.5–3.6. The
endpoint answers `GET {endpoint}?route=<path>` with `{ pageSource, suggestions, mapped }` (the
warm-up of §3.4) and any other method with `405`. The `GET` passes the same origin check and
rate limit as the `POST`, since it can start a crawl.

## 7. Milestones of the library

| # | Delivers |
|---|---|
| L1 | Repository, the npm name, package skeleton, the `aide()` hook and `createChatHandler` with the registry seeded with Anthropic and OpenRouter, `fromEnv`, the fixed prompt order, history windowing, the no-gateway test. Because L1 already exposes an endpoint that spends the key, it ships the minimum guards with it: the body schema, the origin check, the in-memory rate limit and `budget.siteTokensPerDay` |
| L2 | `readPage` through the app's own handler (cookie-less transport, internal marker, configured origin for the network fallback), the shared extractor, the in-memory cache, the background crawl under `waitUntil`, `llms.txt` read (seeds, `.md` twins, `llms-full.txt`), the `aide()` hook serving `/llms.txt`, `/llms-full.txt` and `<route>.md`, `read_page`, the outline in the prompt, the `GET` warm-up |
| L3 | Headless store and components; the plain theme; streaming, markdown to nodes, a11y suite |
| L4 | The shadcn theme; positions, snippet launcher, inline and sheet modes; strings and suggestions |
| L5 | The rest of the guards: the `Store` interface with shared salt, per-visitor budget, `authorize`, `clientKey`, opaque errors; the callbacks under `waitUntil` |
| L6 | The whole provider registry of §3.2 (every official adapter, the compatible presets, `custom`); caching per provider; usage in `onResponse` |
| L7 | Demo site and docs; `publint`; 0.1.0 on npm |

## 8. Acceptance for 0.1

1. A fresh SvelteKit app gets a working, styled chat from the three steps of §1 and no other
   change, both with shadcn-svelte initialised (the widget follows its variables, light and
   dark) and without it (the widget uses its fallbacks); neither needs a Tailwind `@source`.
2. No request leaves the visitor's browser to any origin but the site's, and none leaves the
   site's server to any host but the configured provider's and the configured `origin`;
   recorded by a Playwright network audit and a server-side fetch spy.
3. The build of a client bundle that imports `@chat-aide/sveltekit/server` fails, naming
   `server-only-imported-in-browser`.
4. Every registry row hands `streamText` a model object; `gateway` is not a row and is
   refused by name; a grep for `gateway` in `src/lib` finds only the schema's refusal.
5. Two requests with the same thread and a complete map produce a byte-identical static
   prefix, and the Anthropic adapter marks it; the fixture's prefix is above the model's
   minimum cacheable length, and the provider reports a cache read on the second request.
6. A thread longer than `historyTurns` is windowed on the server even when the client sends
   it whole.
7. `read_page` for a foreign origin, a non-pathname or an excluded route answers "not a page
   of this site" and makes no request; for an unknown same-site route it renders it once.
   The refused set includes at least `//evil.example/x`, `//169.254.169.254/latest/meta-data/`,
   `/\evil.example`, `/a/../api/x`, `/%2e%2e/api/x`, `/%2F%2Fevil.example`,
   `http://evil.example/`, and the same inputs as `aide.route` and `GET ?route=` are
   `400 invalid_request` with no read made (held by a fetch spy).
8. Origin refusal, body refusal, rate limit and budget each answer their code and fire
   `onRefused`; a provider error answers `provider_error` and fires `onError` with the real one.
9. The three themes pass one Playwright suite: keyboard open and close, focus trap, `Escape`,
   `aria-live` announcement, 320 px without horizontal scroll, reduced motion.
10. Markdown with raw HTML, `javascript:` and `data:` links renders none of them. Inline and
    reference-style images render no `<img>` and cause no request (held by the network
    audit), and under the default `answerLinks: 'same-origin'` an external link renders as
    text only.
11. `onMessage` and `onResponse` fire once per turn with the usage the provider reported.
12. `pnpm check` (svelte-check, eslint, vitest, Playwright, publint, audit) is green.
13. No read the library makes carries a visitor's cookie or header, held by a test that mounts
    the handler in an app whose pages echo their request headers.
14. A page the browser fills in after load is answered from the DOM under `'auto'`, and the
    DOM text is never found in the shared cache afterwards.
15. A fresh app with no configuration beyond the provider answers a question about a page it
    was never told about; no file was generated to make it so.
16. A site that serves its own `/llms.txt` has a complete outline on its first request with
    no page rendered but the current one, and the hook does not shadow it; a page with a
    `.md` twin is read from it and never extracted.
17. A fresh app with the one-line hook answers `/llms.txt`, `/llms-full.txt` and `/<route>.md`
    for every mapped page, validating against the convention, listing every mapped page and
    no excluded one, with no file in the tree and no build step.
18. `fromEnv` builds every registry provider from its variables, throws naming the missing
    one, and reads nothing the table does not list (held by a proxy object that records
    every key read).
19. A request with a forged `Host` header causes no read of any origin but the configured
    one, and nothing from the forged host enters the cache.
20. The library's own reads of `/llms.txt`, `/llms-full.txt` and `<route>.md` reach the app,
    never the hook's generated documents: on an app with none of those files every such read
    is a `404`, and no read recurses.
21. The crawl records no URL with a query or hash, and follows no link to the default
    side-effect excludes (`/logout` and the rest of §3.4) present in the fixture.
22. On a platform that exposes `waitUntil`, the crawl, refreshes and callbacks are handed to
    it; with a mock that ends the invocation when the response closes, `onResponse` still
    fires.
23. The site-wide budget refuses with `budget_exhausted` across many client addresses once
    `siteTokensPerDay` is spent.
24. With a telemetry integration registered globally by the host app, a full chat turn
    records nothing through it.
25. Every limit, the rate limit and both budgets take a developer's value in place of the
    default; a value above a ceiling is refused, and accepted once `limitCeilings` raises it.
26. A same-site route that redirects to another host, or through more than 3 same-site hops,
    is read as unreadable, and the fetch spy records no request past the site's origin.
27. Asking for 10 000 invented routes leaves the cache at no more than `maxPages` entries and
    renders each missing route at most once a minute.
28. A page returned by `pages.source` is absent from `/llms.txt`, `/llms-full.txt` and its
    `<route>.md`, and present in all three once `llms.serveSource` is `true`.

## 9. Tests

- Unit (vitest): extractor rules on the same fixtures from linkedom and from a browser DOM;
  the crawl (bounds, exclusions, same-origin, sitemap and `llms.txt` seeds, `.md` twins,
  `llms-full.txt` splitting, TTL and stale-while-revalidate with a fake clock); the
  `llms.txt` renderer against the convention's grammar; the cookie-less read
  (`credentials: 'omit'`, no header but `accept` and the marker); the internal marker's
  bypass of the hook; the forged-`Host` read; query and side-effect link exclusion; the
  landmark-only `<header>` rule; prompt order and prefix stability; windowing; schema
  refusals, `store` without `salt` included; origin check; rate limit and both budgets with
  a fake clock; `waitUntil` handoff; provider factories; the no-gateway assertion; the
  telemetry opt-out with a registered integration; limit overrides and `limitCeilings`;
  markdown-to-nodes over a hostile corpus (images, reference images, external links under
  both `answerLinks` values); the route rule over the refused set of acceptance #7; redirect
  handling (foreign `Location`, more than 3 hops); miss caching and LRU eviction at
  `maxPages`; `pages.source` pages absent from the `llms` routes unless `serveSource`.
- Handler (vitest, `MockLanguageModelV4` from `ai/test`): streaming, tool loop bound,
  callbacks, opaque errors, refusals.
- Browser (Playwright against `apps/demo` with the mock model): the a11y suite per theme, the
  network audit, the thread surviving a reload, the launcher snippet, every position, the
  warm-up repeated on client-side navigation, and the shadcn theme in a fixture app with
  and without shadcn-svelte.
- Build: the client-import-fails test; `publint`.

## 10. Open questions for L1

- Whether an adapter's prerendered routes are reachable through the in-process `fetch` or
  only over the network against the configured `origin`; L2 measures it on `adapter-node`, `adapter-vercel`, `adapter-netlify`
  and `adapter-cloudflare` and records which fallback each needs.
- Whether the event's `fetch` stays usable as the in-process transport after its response
  has closed (for the background crawl), on each of those adapters; where it does not, the
  crawl runs on the network fallback against the configured `origin`.
- How `waitUntil` is reached on each adapter, and whether handler creation can detect a
  serverless adapter reliably enough to warn about the in-memory store.

Decided since v0.1: the thread defaults to `sessionStorage` (§2, §3.8), the privacy-preserving
choice, with `persistThread` to switch.
