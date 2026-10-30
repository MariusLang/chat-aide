# Security

## The key stays on the server

`@chat-aide/sveltekit/server` maps its `browser` export condition to a module that imports a
specifier that does not exist, so a client bundle importing it fails to build with
`@chat-aide/sveltekit/server-only-imported-in-browser` in the error. Errors to the client are opaque
`{ error, message }` JSON; the provider's real error goes to `onError` only. Nothing is logged
except the few one-time setup warnings listed in [Deployment](deployment.md#warnings).

## What the endpoint refuses

| check | refusal |
|---|---|
| `Sec-Fetch-Site: same-origin`, or `Origin` equal to `origin` or listed in `allowedOrigins` (`same-site` is not enough; without `origin` only `Sec-Fetch-Site: same-origin` passes; never compared with `Host`) | `403 origin_refused` |
| `authorize(event)` returning `false` (or throwing) | `403 unauthorized`; a returned `Response` is sent as is |
| rate limit per visitor (`rateLimit.requests` per `windowSeconds` for messages; `rateLimit.warmups` for `GET` warm-ups and the `llms` paths, which can start the crawl) | `429 rate_limited` |
| per-visitor or site-wide daily token budget | `429 budget_exhausted` |
| body: shape, message count, characters per message, parts per message, route, DOM text size, a byte cap on the whole body | `400 invalid_request` with the failing path only |
| methods other than `GET`/`POST` | `405 method_not_allowed` |

### It is callable by scripts

The origin check stops *other web pages* from spending your key through a visitor's browser. It
does **not** stop a script: a non-browser client sends whatever headers it likes, so the endpoint
is callable by anyone who can reach your site. What bounds that is the rate limit and the
budgets, above all `budget.siteTokensPerDay`, together with the single read-only tool and the
site-scoped system prompt. Set `siteTokensPerDay` to what you are willing to pay per day, and add
`authorize` if the chat should only serve signed-in or consenting visitors.

### Behind a proxy

The rate limit is keyed by an HMAC of `event.getClientAddress()` under a salt; no address is
stored. The library reads no forwarded header by itself. Behind a proxy or CDN that SvelteKit's
adapter is not configured for, every visitor has the proxy's address, shares one bucket, and one
client can use it up for everybody. Handler creation cannot detect this. Either configure your
adapter's address header (e.g. `ADDRESS_HEADER` on adapter-node), or pass `clientKey`:

```ts
clientKey: (event) => event.request.headers.get('cf-connecting-ip') ?? event.getClientAddress()
```

Read only a header your proxy sets and a client cannot forge.

## One route rule

Every route the library touches — `aide.route`, `GET ?route=`, `read_page`'s argument, crawled
links, sitemap `<loc>`s, `llms.txt` links, redirect targets — must be a pathname of at most 512
characters starting with exactly one `/`, with no `\`, no `%2f`/`%5c`/`%2e`, no control
character, resolving to the configured origin (or the in-process sentinel without one). Dot
segments are resolved and query and hash dropped. Excludes are then matched against the pathname
**as SvelteKit decodes it for routing**, so `/%61pi/x` is `/api/x` and excluded; an undecodable
pathname is refused. A refused route is `400 invalid_request` or, from `read_page`, "Not a page of
this site.", and no read is made.

Default excludes: `/api/**`, any last segment with a file extension, and last segments `logout`,
`logoff`, `signout`, `sign-out`, `unsubscribe`, `delete`, `remove` (a GET there may act).

## Reads of your site

Every read is anonymous: `credentials: 'omit'` and a fresh set of headers holding only `accept`,
`accept-language: *` and the library's internal marker (`x-aide-internal`, random per process).
No cookie or header of the visitor's request is forwarded, so nothing personalised or behind a
login enters a cache other visitors read from. Redirects are followed only when the target passes
the route rule, at most 3 hops. A read is abandoned after 10 seconds, and a body over 2 MB is
treated as unreadable. Only a `200` HTML page, or a `200` markdown answer from its `.md` twin, is
cached as a page; anything else is a miss, remembered for 60 seconds without its body.

The origin reads go to is `config.origin`, never the request's `Host`. See
[Deployment → origin](deployment.md#origin).

## Prompt injection

Page text (the current page and each `read_page` result) and the site outline, built from crawled
titles, headings and descriptions, sit in delimited data blocks. Visitor messages go to the model
as ordinary chat messages, outside those blocks; the default system prompt names all of them as
data. The one tool reads pages of this site and nothing else; there is no tool that fetches, writes or
navigates. But crawled text reaches every visitor's prompt, so text a visitor wrote (comments,
forum posts, reviews, profile fields) can carry instructions to other visitors' chats.
**Put `data-aide-ignore` on every element holding visitor-written text:**

```svelte
<section data-aide-ignore>
	{#each comments as c}<p>{c.body}</p>{/each}
</section>
```

The extractor drops those subtrees on the server and in the widget. The widget marks itself
`data-aide-ignore` too, so a transcript is never read back as page text.

## What an answer may render

The answer's markdown is rendered to DOM nodes by Svelte components, never through an HTML string,
and nothing in an answer makes the browser send a request without a click:

- **No images.** `![alt](url)` and reference images become their alt text. No `<img>`, `srcset`
  or CSS `url()` is created from an answer.
- **Links** keep only `http(s)` and same-origin targets. With `answerLinks: 'same-origin'` (the
  default) a link to another host renders as its text; `'any'` keeps it with
  `rel="noopener noreferrer"` and `target="_blank"`. Same-origin links navigate with `goto` on
  click, and carry `data-sveltekit-preload-data="off"` and `data-sveltekit-preload-code="off"`, so
  hovering one does not run a `load`.
- Raw HTML is shown as text.

## DOM text

The widget sends the page's visible text only when the server asked for it in the warm-up, and
the server uses it only when `pageContext` is `'dom'`, or `'auto'` and its own render is thin; it
is never cached. A forged `dom` reaches only the forger's own conversation.

## Privacy

What leaves the browser: the visitor's messages, the route, the widget's random `sessionId`, and
the page's text when the server asked for it. It goes to your server and from there to your
provider; the library stores none of it. The thread is kept in the tab's `sessionStorage`
(`persistThread={false}` to switch off). The disclosure line under the composer names the
provider; set `disclosure` to the sentence your policy needs, and render the widget with
`enabled={false}` until consent where you need one.

## CSP

No inline scripts. The shadcn theme's styles are a stylesheet imported by its components. The
plain theme injects one `<style>`, which takes `nonce`, or `stylesheet={false}` when you link
`@chat-aide/sveltekit/themes/plain/plain.css` yourself. The `offset` prop is applied as an inline
`style` attribute, so under a strict `style-src` without `'unsafe-inline'` leave `offset` unset and
set `--aide-offset-x` / `--aide-offset-y` from your own stylesheet instead ([Theming](theming.md#csp)).

## Supply chain

No `postinstall`, no `bin`; dependencies are caret ranges within a major; `pnpm audit --prod` runsin CI. SDK telemetry is disabled on every `streamText` call, even when the host app registered a
telemetry integration.
