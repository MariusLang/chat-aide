# Configuration

`aide(config)` and `createChatHandler(config)` take the same `AideConfig` (exported as a type from
`@chat-aide/sveltekit/server`). It is validated with zod when the handler is created; an invalid
config throws `AideConfigError` with the path that failed, e.g.
`limits.pageChars: 1200000 is above the ceiling 50000; raise it deliberately with limitCeilings: { pageChars: 1200000 }`.
Unknown keys are refused.

## Options

| option | default | meaning |
|---|---|---|
| `provider` | required | `{ name, model, apiKey?, baseURL?, headers?, options?, … }`, see [Providers](providers.md) |
| `origin` | none | the site's public origin (`https://example.com`, no path). Never taken from the request. See [Deployment](deployment.md#origin) |
| `endpoint` | `'/api/chat'` | the chat path; pass the same to the widget |
| `pages.include` | `[]` | extra crawl seeds |
| `pages.exclude` | `[]` | globs never read, mapped or served: `*` one segment, `**` any depth (`/blog/drafts/**`) |
| `pages.source` | none | `async () => Page[]` in place of the crawl, see below |
| `llms.read` | `true` | read the site's own `/llms.txt` and `/llms-full.txt` |
| `llms.preferMarkdown` | `true` | ask for `<route>.md` before the HTML of each page |
| `llms.serve` | `true` | the hook answers `/llms.txt`, `/llms-full.txt`, `<route>.md` (when the app does not) |
| `llms.serveSource` | `false` | also serve pages that came from `pages.source` |
| `cache.ttlSeconds` | `3600` | page and site-map lifetime; stale pages are served while a refresh runs |
| `waitUntil` | detected | `(promise) => void`, for a platform whose own is not detected ([Deployment](deployment.md#serverless)) |
| `systemPrompt` | `defaultSystemPrompt` | a string, or `(ctx: PromptContext) => string` |
| `persona` | none | `{ name?, tone?, language?, audience?, refusals? }`, rendered under the system prompt |
| `facts` | none | `string \| string[]`: facts the pages do not carry (pricing, support address) |
| `pageContext` | `'auto'` | where the current page's text comes from: `'server'`, `'dom'`, or `'auto'` (server render, the widget's DOM text when the render is thinner than `minPageChars`) |
| `suggestions` | none | `string[]` or `{ [route]: string[], '*': string[] }`, sent in the warm-up |
| `limits` | see below | any subset |
| `limitCeilings` | see below | raises a ceiling deliberately |
| `rateLimit` | `{ requests: 20, windowSeconds: 600, warmups: 60 }` | per visitor, fixed windows; `false` turns it off |
| `budget` | `{ tokensPerDay: 200_000, siteTokensPerDay: 5_000_000 }` | each field may be `false`; `false` turns both off |
| `store` | in-memory | shared state, see [Deployment](deployment.md#shared-store); requires `salt` |
| `salt` | random per process | HMAC salt for visitor keys; required with `store`, refused without it |
| `allowedOrigins` | `[]` | extra origins whose `Origin` header the endpoint accepts |
| `authorize` | none | `(event) => boolean \| Response \| Promise<…>`; `false` → `403 unauthorized`, a `Response` is returned as is |
| `clientKey` | client address | `(event) => string`, the visitor's rate-limit identity (read [this](deployment.md#behind-a-proxy) first) |
| `caching` | `true` | provider prompt-cache markers |
| `onMessage`, `onResponse`, `onRefused`, `onError` | none | callbacks, see below |

## Limits

Every number is a default. Pass any subset in `limits`; a value above its ceiling is refused as a
likely typo, and accepted once you raise the ceiling with `limitCeilings`.

| limit | default | ceiling | meaning |
|---|---|---|---|
| `pageChars` | 12 000 | 50 000 | text of one page (current page, `read_page`, DOM text) |
| `minPageChars` | 200 | 5 000 | below this a page is "thin" (and `'auto'` asks for the DOM) |
| `outlineChars` | 6 000 | 40 000 | the site outline in the prompt |
| `historyTurns` | 12 | 50 | turns of history the server keeps |
| `historyChars` | 16 000 | 100 000 | characters of history the server keeps |
| `maxOutputTokens` | 1 024 | 8 192 | per model step |
| `maxSteps` | 3 | 8 | model steps per turn (tool calls included) |
| `messageChars` | 4 000 | 20 000 | one visitor message |
| `messages` | 60 | 200 | messages in one request body |
| `maxPages` | 200 | 5 000 | pages mapped, and pages (and misses) cached per instance |
| `crawlConcurrency` | 4 | 16 | reads in flight during the crawl |
| `crawlBudgetMs` | 1 500 | 10 000 | how long a turn or an `llms` request waits for the crawl |

```ts
aide({
	provider,
	limits: { pageChars: 30_000, maxPages: 8_000 },
	limitCeilings: { maxPages: 8_000 }, // above the 5 000 ceiling, deliberately
	rateLimit: { requests: 40 },
	budget: { siteTokensPerDay: false }
});
```

The server windows the history (oldest dropped first) whatever the client sends, and the widget
trims its request to `messages` and `messageChars` from the warm-up, so a long tab never gets
stuck on `400`.

## Budgets and their overshoot

Budgets count `inputTokens + outputTokens`. The usage of every finished model step is added up
and charged when the turn ends, however it ends (a later step failing, the visitor
disconnecting), and the budget is checked before the next turn starts. So:

- a single turn can overshoot a budget by at most its own cost (bounded by the input limits and
  `maxOutputTokens × maxSteps`);
- concurrent requests are each checked before any of them is charged, so each can overshoot by
  one turn.

`budget.siteTokensPerDay` is the number that bounds your bill: a per-visitor key is an address,
and addresses are cheap to rotate. Day counters are per UTC day.

## The prompt, and when it caches

The prompt is assembled in a fixed order: system prompt, persona, facts, site outline (the
static prefix), then the current page, the windowed history and the visitor's message. With
`caching: true`, Anthropic gets `cacheControl` on the prefix and Bedrock a `cachePoint`; OpenAI,
Gemini, DeepSeek, Groq and the OpenAI-compatible endpoints cache on their side.

The prefix is byte-identical between requests only while its inputs are. Each of these starts a
new prefix, so the next request pays full price for it:

- a `systemPrompt` function whose result varies per request (it receives the route);
- a `facts` value that changes;
- the "outline is partial" note, present while the crawl is still running, and the outline
  itself changing as the map fills or refreshes.

Providers cache only a prefix above their minimum length (Anthropic's is model-specific and
larger for its small models), so a small site's prefix may not cache at all. The library does
not pad it.

## `pages.source`

For a site whose content lives in a CMS, is too large to crawl, or cannot be rendered by the app:

```ts
import type { Page } from '@chat-aide/sveltekit/server';

aide({
	provider,
	pages: {
		source: async (): Promise<Page[]> =>
			(await cms.published()).map((p) => ({
				route: `/docs/${p.slug}`,
				title: p.title,
				description: p.summary,
				headings: [],
				text: p.plainText
			}))
	}
});
```

When set, the crawl does not run and `read_page` reads from it; the current page still comes
from a render or the DOM. Routes go through the same route rule and excludes, at most `maxPages`
are kept, text is cut to `pageChars`.

**Return only text any visitor may read.** What the function returns reaches the model, and
through the model any visitor who asks. It is not served on the `llms` paths unless you set
`llms.serveSource: true`, but that does not keep it from the chat.

## Callbacks

None delays the response; each runs after its event under `waitUntil`, and a throw is handed to
`onError` (one from `onError` itself is dropped), never to the visitor.

```ts
onMessage({ sessionId, route, text, at })
onResponse({ sessionId, route, text, usage, model, provider, durationMs, finishReason, toolCalls, at })
onRefused({ sessionId, code, at })   // invalid_request, origin_refused, rate_limited, budget_exhausted, unauthorized, method_not_allowed, provider_error
onError({ sessionId, error, at })    // the provider's real error; the visitor sees a generic sentence
```

`usage` is AI SDK 7's `LanguageModelUsage` summed over the steps (`inputTokens`, `outputTokens`,
`totalTokens`, `inputTokenDetails.{noCacheTokens, cacheReadTokens, cacheWriteTokens}`,
`outputTokenDetails.{textTokens, reasoningTokens}`), each `undefined` where the provider does not
report it. `sessionId` is minted by the widget and is the only identifier the library has.
