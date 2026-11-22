# llms.txt

[llms.txt](https://llmstxt.org) is a markdown index of a site: an H1, a `>` summary, and sections
of `- [title](url): description` links, with `/llms-full.txt` for the whole content and a `.md`
twin of each page (`/docs/intro.md`; the root and routes ending in `/` at `<route>/index.html.md`).
The library reads it from your site and serves one generated from its site map.

## Reading your site's own

With `llms.read: true` (the default) the crawl first reads your `/llms.txt`, anonymously and
through your app, never the hook's generated one:

- its title and summary describe the site in the prompt;
- its links — page routes or their `.md` twins, which are mapped back to the page route — seed
  the crawl and **set the outline's order**, in the order you wrote them; links under
  `## Optional` come last. Their descriptions fill the outline before any page is rendered, so a
  site with a usable `llms.txt` has a complete outline on the first request;
- pages the crawl finds that your file does not list are merged in after your links;
- your file is used verbatim as the outline's base; over `limits.outlineChars` it is cut at the
  last whole link line, `## Optional` first, and the cut is marked.

`/llms-full.txt`, when present, is split at its page headings straight into the page cache, so
`read_page` needs no render for those pages. And with `llms.preferMarkdown: true` every page read
asks for `<route>.md` first and uses it when the answer is markdown. The page's HTML is then still
requested once, only to see whether it says `noindex` ([below](#pages-that-say-noindex)).

Every link goes through the route rule and your excludes. Absolute links must be on `origin`;
without `origin` configured they are dropped (use relative links, or set `origin`).

## Serving one

Through the `aide()` hook, with `llms.serve: true` (the default), and only where your app answers
`404`:

| path | content | type |
|---|---|---|
| `/llms.txt` | site title, summary (your `llms.txt`'s, else `facts`, else the root page's description), then one section per top-level path segment of `- [title](route): description` | `text/plain` |
| `/llms-full.txt` | the same, with each page's text | `text/markdown` |
| `<route>.md` | one mapped page | `text/markdown` |

Nothing is generated at build time and no file is written: each is the site map, serialised on
request, with `cache-control: public, max-age=<cache.ttlSeconds>`. Excluded routes and pages that
say `noindex` are never listed. Pages from `pages.source` are left out unless
`llms.serveSource: true`.

A request to any of these paths counts against the visitor's warm-up bucket
(`rateLimit.warmups`, `429 rate_limited` past it) and starts the crawl if it is not running,
waiting at most `limits.crawlBudgetMs` for it.

A site that already serves `/llms.txt` keeps it: the hook calls `resolve` first. `llms.serve:
false` turns the serving off entirely. To mount the documents as your own routes, use `llmsTxt`,
`llmsFullTxt` and `pageMarkdown` from `@chat-aide/sveltekit/llms` ([Getting started → mounting by
hand](getting-started.md#mounting-by-hand)).

## Pages that say `noindex`

A page that asks robots not to index it is treated like a page in `pages.exclude`. It is not
listed in `/llms.txt` or `/llms-full.txt`, not served as `<route>.md`, not in the outline, and
`read_page` does not return it. None of its text is cached. The chat still works on such a page,
without the page's text.

The library looks at the answer to an anonymous request for the page itself:

- every `<meta name="robots" content="…">` in its HTML;
- the `X-Robots-Tag` header.

`noindex` hides the page. `nofollow` keeps the crawl from following the page's links, as
`rel="nofollow"` does for a single link. `none` means both. A page that says only `noindex` still
has its links followed. Letter case does not matter, and one tag or header saying `noindex` is
enough.

Only directives for every robot count. `<meta name="googlebot" …>` is skipped, and so is a header
directive with a user agent in front of it (`X-Robots-Tag: googlebot: noindex`). Repeated header
lines arrive as one comma-separated value, so a user agent covers only the directive written
directly after it: in `googlebot: noindex, nofollow` the `nofollow` counts for everyone.

What this does not cover:

- A tag added in the browser. The directive has to be in what your server sends.
- An `X-Robots-Tag` on a `.md` twin. It is taken to be about the `.md` file; the page's own HTML
  decides.
- Text in your own `/llms-full.txt`, and pages from `pages.source`. They are used as you wrote
  them, without a render, so leave such a page out or put it in `pages.exclude`.

Unlike an excluded page, a `noindex` page is requested: the library has to read it to see the
directive. A change on the page takes effect when its cached copy is refreshed, after
`cache.ttlSeconds`.

`pages.respectNoindex: false` turns all of this off.
