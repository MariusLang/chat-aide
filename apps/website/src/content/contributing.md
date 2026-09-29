# Contributing

svelte-chat-aide is an MIT-licensed pnpm monorepo. This page explains how to run it locally,
where things live and how to check a change.

## Set up

You need Node 24 or newer and pnpm 10.

```sh
git clone <repository-url> svelte-chat-aide
cd svelte-chat-aide
pnpm install
pnpm --filter svelte-chat-aide build
```

The apps import the library from its built `dist`, so build it once before starting an app, and
again after changing it.

## Repository layout

| path | what |
|---|---|
| `packages/svelte-chat-aide` | the library: server handler, site reader, llms.txt, the three widget layers |
| `apps/demo` | a test site with a mock model, and the Playwright suite |
| `apps/demo-plain-host` | a site without Tailwind or shadcn, for the plain theme |
| `apps/website` | this website |
| `docs/` | the documentation, rendered on this site |
| `spec.md` | the specification the library is built against |

Inside the library, `src/lib/server` holds the hook and chat handler, `src/lib/site` the crawler
and page reader, `src/lib/llms` the `llms.txt` routes, `src/lib/headless` the store and unstyled
components, and `src/lib/themes` the shadcn and plain themes.

## Run this website

```sh
cd apps/website
SVELTE_CHAT_AIDE_PROVIDER=anthropic \
SVELTE_CHAT_AIDE_MODEL=claude-haiku-4-5 \
SVELTE_CHAT_AIDE_API_KEY=sk-… \
pnpm dev
```

Without those variables the site still runs; the chat is hidden. Any provider from
[Providers](providers.md) works through [`fromEnv`](providers.md#fromenv).

## Run the demo without a key

The demo ships a mock model, so the whole chat works offline:

```sh
cd apps/demo
AIDE_MOCK=1 pnpm dev
```

## Check a change

From the repository root:

```sh
pnpm check
```

runs svelte-check, eslint, vitest, the Playwright suite, publint and `pnpm audit`. CI runs the same
command on Node 24 and 22.

## Edit the docs

The pages under Guides, Operate and Getting started come straight from `docs/*.md` in the
repository; this site renders them at run time. Links between them are ordinary relative links
(`providers.md#fromenv`), so they work on GitHub and here. The Introduction, Customizing and
Contributing pages live in `apps/website/src/content`.
