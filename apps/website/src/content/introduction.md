# Introduction

chat-aide puts an AI chat on your own site. It answers from your pages, and nothing else,
and it also serves an `llms.txt` for the site. It started on SvelteKit, where you install one
package, add one line to `hooks.server.ts` and drop `<ChatWidget />` into your root layout. The
same server now runs on Next.js with a React widget, and on any framework that speaks
web-standard `Request` and `Response`.

## How it works

There is no indexing step, no vector database and nothing to commit. When the first visitor opens
the chat, the server reads your pages from the running app, anonymously, and keeps a map of them in
memory. Each answer gets three things:

- the text of the page the visitor is on;
- an outline of every other page (title, description, headings);
- one tool, `read_page`, that reads a single page of this site and nothing else.

So when you publish a page, the chat knows about it after the next cache refresh
(`cache.ttlSeconds`, one hour by default).

## What you get

- **A chat widget** for Svelte (a shadcn-svelte theme that follows your shadcn variables, a
  dependency-free plain theme, and a headless store) and for React (the plain theme and headless
  parts, plus a `useAide` hook).
- **Any provider the AI SDK has an adapter for**: Anthropic, OpenAI, Google, Mistral, Groq,
  Bedrock, Azure, OpenRouter, any OpenAI-compatible server, and more. Requests go straight to the
  provider; SDK telemetry is off.
- **Bounded cost**: a per-visitor rate limit, a per-visitor and a site-wide daily token budget,
  hard limits on every input, and prompt caching where the provider supports it.
- **`/llms.txt`, `/llms-full.txt` and `<route>.md`**, generated from the same map, unless your app
  already answers those paths.

## Pick your framework

| framework | install | guide |
|---|---|---|
| SvelteKit | `pnpm add @chat-aide/sveltekit` | [SvelteKit](/docs/getting-started) |
| Next.js | `pnpm add @chat-aide/next @chat-aide/react` | [Next.js and React](/docs/nextjs) |
| Astro, React Router, Hono, Nuxt, Bun | `pnpm add @chat-aide/core` | [Other frameworks](/docs/other-frameworks) |

All three share one core, `@chat-aide/core`: the same crawler, prompt, providers, limits and
security rules. The Svelte and React widgets render the same structure and share the plain theme.

## What it is not

It is not a hosted service, not a RAG platform and not for static-only sites: it needs a server
at run time. It stores nothing on the server beyond an in-memory cache.

## This website runs on it

The chat in the corner of this site is chat-aide itself, with the shadcn theme and the
default settings. It has read these docs the same way it would read yours. Ask it how to install,
which provider to pick or how to restyle the widget.

## Where next

- [SvelteKit](/docs/getting-started) or [Next.js and React](/docs/nextjs): install, wire, verify.
- [Customizing](/docs/customizing): prompt, persona, suggestions, strings and your own widget.
- [Configuration](/docs/configuration): every option and limit.
