# Contributing

chat-aide is an MIT-licensed pnpm monorepo. This page explains how to run it locally,
where things live and how to check a change.

## Set up

You need Node 24 or newer and pnpm 10.

```sh
git clone <repository-url> chat-aide
cd chat-aide
pnpm install
pnpm -r --filter './packages/**' build
```

The apps import the packages from their built `dist`, so build them once before starting an app,
and again after changing one.

## Repository layout

| path | what |
|---|---|
| `packages/core` | `@chat-aide/core`: the framework-neutral server, site reader, llms.txt and widget helpers |
| `packages/sveltekit` | `@chat-aide/sveltekit`: the SvelteKit hook and the three Svelte widget layers |
| `packages/react` | `@chat-aide/react`: the React widget and `useAide` |
| `packages/next` | `@chat-aide/next`: Next.js route handlers |
| `apps/demo` | a SvelteKit test site with a mock model, and its Playwright suite |
| `apps/demo-next` | a Next.js test site with the React widget, and its Playwright suite |
| `apps/demo-plain-host` | a site without Tailwind or shadcn, for the plain theme |
| `apps/website` | this website |
| `docs/` | the documentation, rendered on this site |
| `spec.md` | the specification the library is built against |

Inside the core, `src/server` holds the chat handler and the web-standard adapter, `src/site` the
crawler and page reader, `src/llms` the `llms.txt` routes and `src/client` the browser helpers the
widgets share. The Svelte package adds `src/lib/server/hook.ts`, `src/lib/headless` and
`src/lib/themes`.

## Run this website

```sh
cd apps/website
CHAT_AIDE_PROVIDER=anthropic \
CHAT_AIDE_MODEL=claude-haiku-4-5 \
CHAT_AIDE_API_KEY=sk-… \
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

runs the type checks, eslint, vitest, both Playwright suites (SvelteKit and Next.js), publint and
`pnpm audit`. CI runs the same
command on Node 24.

## Release

Publish a GitHub release with a tag such as `v0.2.0`. The `Release` workflow checks the packages,
sets all four to that version and publishes them to npm, so nothing needs bumping in the repository.
A release marked as a prerelease, tagged like `v0.2.0-beta.1`, goes to the `next` dist-tag. A tag
that is not on `main`, or not a version, is refused. Re-running the workflow skips versions already
on npm.

The workflow authenticates with npm trusted publishing, so each package needs
`MariusLang/chat-aide` and `release.yml` set as its trusted publisher on npmjs.com.

## Edit the docs

The pages under Frameworks, Guides and Operate come straight from `docs/*.md` in the
repository; this site renders them at run time. Links between them are ordinary relative links
(`providers.md#fromenv`), so they work on GitHub and here. The Introduction, Customizing and
Contributing pages live in `apps/website/src/content`.
