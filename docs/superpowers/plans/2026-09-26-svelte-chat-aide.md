# svelte-chat-aide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `svelte-chat-aide` SvelteKit library described in `spec.md` (v0.2): a server `Handle` that answers a chat endpoint and `llms.txt` documents from a run-time site map, plus a chat widget in headless, plain and shadcn themes, with a demo app and a full test suite.

**Architecture:** pnpm monorepo. `packages/svelte-chat-aide` is a SvelteKit library built with `@sveltejs/package`; server code (`src/lib/server`, `src/lib/site`, `src/lib/llms`) never reaches a browser bundle; UI code (`src/lib/headless`, `src/lib/themes/*`) consumes only `src/lib/shared` and `src/lib/site/extract.ts`. `apps/demo` is a SvelteKit site (adapter-node) using the library with a mock model for Playwright.

**Tech Stack:** TypeScript 6, Svelte 5 (runes), SvelteKit 2, Vite 8, AI SDK 7 (`ai`, `@ai-sdk/svelte`, adapters), zod 4, linkedom, marked (lexer only), Tailwind 4 (build time), shadcn-svelte CLI + bits-ui, vitest 5, Playwright 1.63, pnpm 10, Node 24.

## Global Constraints

Every task implicitly includes these. They are copied from `spec.md`; the spec is the source of truth — read the section cited by each task before starting it.

- Versions (npm latest, verified 2026-09-26): `ai` 7.0.116, `@ai-sdk/svelte` 5.0.116, `@ai-sdk/anthropic` 4.0.65, `@ai-sdk/openai` 4.0.78, `@ai-sdk/openai-compatible` 3.0.57, `@ai-sdk/google` 4.0.82, `@ai-sdk/mistral` 4.0.52, `@ai-sdk/amazon-bedrock` 5.0.97, `@openrouter/ai-sdk-provider` 3.1.0, `svelte` 5.57.1, `@sveltejs/kit` 2.70.3, `@sveltejs/package` 2.5.8, `vite` 8.3.1, `tailwindcss` 4.3.3, `shadcn-svelte` 1.7.0, `bits-ui` 2.19.3, `zod` 4.6.5, `linkedom` 0.18.13, `vitest` 5.0.2, `@playwright/test` 1.63.0, `publint` 0.3.24, `svelte-check` 4.7.6, `typescript` 6.0.3 (NOT 7), `eslint` 10.11.0, `@sveltejs/adapter-node` 5.5.7, `mode-watcher` 1.1.0. Ranges are carets on these.
- Peer deps of the library: `svelte ^5`, `@sveltejs/kit ^2`, `ai ^7`; every provider adapter is an **optional** peer.
- Node engines `>=24`. No `postinstall`. No `bin`.
- **Never** pass a bare model-id string to `streamText`; never read/set `globalThis.AI_SDK_DEFAULT_PROVIDER`; the word `gateway` appears in `src/lib` only in the config schema's refusal message.
- Every `streamText` call passes `telemetry: { isEnabled: false }`. Use `instructions` (not `system`), `stopWhen: isStepCount(n)`, `result.stream` + `toUIMessageStream({ stream })` + `createUIMessageStreamResponse({ stream })`, `result.usage`, `onEnd`. **Verify every AI SDK name against `node_modules/ai/dist/index.d.ts` before using it**; if a name differs, use the real one and note it in the commit message.
- The library reads no environment variable itself (`fromEnv(env)` reads only the object handed in).
- Every library-made read of the site: `credentials: 'omit'`, fresh `Headers` with only `accept` and `x-aide-internal: <per-process random>`, `redirect: 'manual'`.
- Origin for every same-origin decision = `config.origin`, never `event.url.origin`. In-process sentinel origin when none: `http://aide.internal`.
- Answer markdown renders to DOM nodes via Svelte components — no `{@html}` anywhere in `src/lib` for answer content; no `<img>` from answers.
- Errors to the client are opaque (`{ error, message }`); nothing is logged by default (no `console.*` in `src/lib/server` or `src/lib/site` except the documented creation-time warnings via one `warn()` helper).
- Tests: vitest for unit/handler (`packages/svelte-chat-aide/tests/unit/**`), Playwright for browser (`apps/demo/tests/**`).
- Commit after each task with a conventional message ending in:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Parallel tasks share one working tree: commit ONLY your own files (`git add <explicit paths>`); if `index.lock` exists, wait 2 s and retry. Never run `git add -A`, `git stash`, `git reset` or `git checkout -- .`. Never edit a file owned by another task unless the task says so; if you need a change there, report it instead.

## Out of scope for this run (needs the user)

- Registering / publishing the npm name (outward-facing, irreversible).
- Acceptance #5's live part ("provider reports a cache read") — needs a real Anthropic key; the unit test asserts the markers and byte-identical prefix only.
- §10 open questions (per-adapter measurements on Vercel/Netlify/Cloudflare).
- Renovate is configured (`renovate.json`), not run.

---

## File Structure

```
package.json                     workspace root: scripts check/test/build
pnpm-workspace.yaml              packages/*, apps/*
tsconfig.base.json
eslint.config.js
renovate.json
.github/workflows/ci.yml
README.md
docs/                            usage, config, security, providers, deployment
packages/svelte-chat-aide/
  package.json                   exports map (see Task 1)
  svelte.config.js  vite.config.ts  tsconfig.json  vitest config inside vite.config.ts
  scripts/build-css.mjs          compiles themes/shadcn/styles.src.css -> styles.css (Tailwind 4, prefix(aide))
  src/lib/
    index.ts                     re-exports themes/shadcn
    shared/limits.ts             LIMIT_DEFAULTS, LIMIT_CEILINGS, Limits
    shared/types.ts              Page, PageEntry, Store, ProviderConfig, AideConfig, PromptContext, wire types
    shared/schemas.ts            zod config schema -> ResolvedConfig; body schema factory
    shared/strings.ts            default widget strings, refusal sentences
    shared/markdown.ts           markdown -> safe node tree (MdBlock[])
    site/route.ts                THE route rule
    site/extract.ts              extractor (linkedom + browser DOM)
    site/transport.ts            cookie-less, marker, manual-redirect reads
    site/cache.ts                LRU + TTL + miss cache + SWR, optional Store backing
    site/read-page.ts            readPage: .md twin, then HTML + extract
    site/llms.ts                 parse llms.txt, split llms-full.txt, render llms.txt / full / page md
    site/site-map.ts             crawl, seeds, outline, pages.source
    server/index.ts              aide, createChatHandler, fromEnv, memoryStore, defaultSystemPrompt, types
    server/browser-guard.js      imports 'svelte-chat-aide/server-only-imported-in-browser'
    server/warn.ts               single warn() helper (once per message)
    server/providers.ts          registry
    server/from-env.ts
    server/prompt.ts             defaultSystemPrompt, buildPrompt
    server/window.ts             windowHistory
    server/store.ts              memoryStore
    server/guards.ts             origin check, clientKey HMAC, rate limit, budgets
    server/background.ts         resolveWaitUntil, runCallback
    server/handler.ts            createChatHandler
    server/hook.ts               aide()
    llms/index.ts                llmsTxt(), llmsFullTxt(), pageMarkdown()
    extract/index.ts             re-export of site/extract.ts
    headless/create-chat.svelte.ts
    headless/*.svelte            Launcher, ChatWindow, Transcript, Message, Markdown, Composer, ChatWidget
    headless/index.ts
    themes/plain/                ChatWidget.svelte, ChatWindow.svelte, plain.css, index.ts
    themes/shadcn/               ChatWidget.svelte, ChatWindow.svelte, ChatLauncher.svelte, ui/ (CLI output), styles.src.css, styles.css (generated), index.ts
  tests/unit/**                  vitest
  tests/build/**                 client-import-fails test, publint
apps/demo/                       SvelteKit + adapter-node, mock model when AIDE_MOCK=1, Playwright tests
```

---

## Phase A — Foundation (L1)

### Task 1: Monorepo and package skeleton

**Files:**
- Create: root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js`, `.gitignore`, `.npmrc` (`auto-install-peers=true`, `engine-strict=true`)
- Create: `packages/svelte-chat-aide/{package.json,svelte.config.js,vite.config.ts,tsconfig.json}`
- Create: `packages/svelte-chat-aide/src/lib/server/browser-guard.js`, `src/lib/server/index.ts` (placeholder export `export const __server = true;` replaced in Task 13), `src/lib/server/warn.ts`, stub `index.ts` files for every export path (each exporting nothing yet but valid)
- Create: `packages/svelte-chat-aide/src/routes/+page.svelte` (dev playground: "svelte-chat-aide playground")
- Move: `spec.md` stays at repo root (already there).
- Test: `packages/svelte-chat-aide/tests/build/client-import.test.ts`

**Interfaces — Produces:**
- `package.json` `exports` (dist paths from svelte-package):
  ```json
  {
    ".": { "types": "./dist/index.d.ts", "svelte": "./dist/index.js", "default": "./dist/index.js" },
    "./server": { "types": "./dist/server/index.d.ts", "browser": "./dist/server/browser-guard.js", "default": "./dist/server/index.js" },
    "./headless": { "types": "./dist/headless/index.d.ts", "svelte": "./dist/headless/index.js", "default": "./dist/headless/index.js" },
    "./themes/plain": { "types": "./dist/themes/plain/index.d.ts", "svelte": "./dist/themes/plain/index.js", "default": "./dist/themes/plain/index.js" },
    "./themes/plain/plain.css": "./dist/themes/plain/plain.css",
    "./themes/shadcn": { "types": "./dist/themes/shadcn/index.d.ts", "svelte": "./dist/themes/shadcn/index.js", "default": "./dist/themes/shadcn/index.js" },
    "./llms": { "types": "./dist/llms/index.d.ts", "default": "./dist/llms/index.js" },
    "./extract": { "types": "./dist/extract/index.d.ts", "default": "./dist/extract/index.js" }
  }
  ```
  `files: ["dist"]`, `sideEffects: ["**/*.css"]`, `type: module`, `engines.node >=24`.
- `warn(message: string): void` — `console.warn('[svelte-chat-aide] ' + message)` once per distinct message (module-level Set). Only creation-time warnings may call it.
- `browser-guard.js`: `import 'svelte-chat-aide/server-only-imported-in-browser';` plus `if (typeof window !== 'undefined') throw new Error('svelte-chat-aide/server imported in the browser');`
- Root scripts: `build` (`pnpm -r build`), `test` (`pnpm -r test`), `check` (`pnpm -r check && pnpm -r lint && pnpm -r test && pnpm --filter demo test:e2e && pnpm --filter svelte-chat-aide publint && pnpm audit --prod`).
- Library scripts: `dev`, `build` (`node scripts/build-css.mjs && svelte-kit sync && svelte-package && publint`; build-css.mjs is a no-op stub until Task 17 — create it printing nothing), `check` (`svelte-kit sync && svelte-check`), `lint` (`eslint .`), `test` (`vitest run`), `publint`.

**Dependencies installed here (all of them, once, so later tasks never edit package.json concurrently):**
- library `dependencies`: `zod`, `linkedom`, `marked`, `bits-ui`, `tailwind-variants`, `tailwind-merge`, `clsx`, `@lucide/svelte`, `@ai-sdk/svelte`
- `peerDependencies`: `svelte ^5`, `@sveltejs/kit ^2`, `ai ^7`, and every adapter of spec §3.2 (`@ai-sdk/anthropic ^4`, `@ai-sdk/openai ^4`, `@ai-sdk/azure`, `@ai-sdk/google ^4`, `@ai-sdk/google-vertex`, `@ai-sdk/amazon-bedrock ^5`, `@ai-sdk/mistral ^4`, `@ai-sdk/xai`, `@ai-sdk/groq`, `@ai-sdk/deepseek`, `@ai-sdk/cohere`, `@ai-sdk/togetherai`, `@ai-sdk/fireworks`, `@ai-sdk/deepinfra`, `@ai-sdk/cerebras`, `@ai-sdk/perplexity`, `@ai-sdk/baseten`, `@ai-sdk/huggingface`, `@ai-sdk/openai-compatible ^3`, `@openrouter/ai-sdk-provider ^3`, `@vercel/functions`) — use `npm view <pkg> version` for each and caret its major; every adapter listed in `peerDependenciesMeta` as `{ optional: true }`.
- library `devDependencies`: all peers above (so tests can import every adapter), `@sveltejs/package`, `@sveltejs/vite-plugin-svelte`, `@sveltejs/adapter-auto`, `vite`, `typescript@~6.0.3`, `svelte-check`, `vitest`, `happy-dom`, `publint`, `tailwindcss`, `@tailwindcss/cli`, `shadcn-svelte`, `eslint`, `typescript-eslint`, `eslint-plugin-svelte`, `@types/node`.

- [ ] **Step 1:** `git init` already done. Create root files and `pnpm-workspace.yaml` with `packages: ['packages/*', 'apps/*']`.
- [ ] **Step 2:** Create the library package files above; `vite.config.ts` uses `sveltekit()` and a `test` block: `{ include: ['tests/unit/**/*.test.ts', 'tests/build/**/*.test.ts'], environment: 'node' }`.
- [ ] **Step 3:** `pnpm install`; then `pnpm --filter svelte-chat-aide build` succeeds.
- [ ] **Step 4: Write the failing test** `tests/build/client-import.test.ts`:
  ```ts
  import { build } from 'vite';
  import { describe, it, expect } from 'vitest';
  import { mkdtempSync, writeFileSync, symlinkSync, mkdirSync } from 'node:fs';
  import { join, resolve } from 'node:path';
  import { tmpdir } from 'node:os';

  describe('svelte-chat-aide/server in a client bundle', () => {
    it('fails to build, naming server-only-imported-in-browser', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'aide-client-'));
      mkdirSync(join(dir, 'node_modules'));
      symlinkSync(resolve(__dirname, '../..'), join(dir, 'node_modules', 'svelte-chat-aide'));
      writeFileSync(join(dir, 'entry.js'), "import { aide } from 'svelte-chat-aide/server'; console.log(aide);");
      await expect(
        build({ root: dir, logLevel: 'silent', build: { write: false, lib: { entry: join(dir, 'entry.js'), formats: ['es'] } }, resolve: { conditions: ['browser'] } }),
      ).rejects.toThrow(/server-only-imported-in-browser/);
    }, 60_000);
  });
  ```
  (Requires `dist/` — run `build` first; the `test` script runs `svelte-package` beforehand if `dist` is missing: add `pretest` = `test -d dist || pnpm build`.)
- [ ] **Step 5:** Run `pnpm --filter svelte-chat-aide test` — PASS (guard already written). Temporarily point `browser` at `index.js` to confirm it FAILS, then restore.
- [ ] **Step 6:** `pnpm --filter svelte-chat-aide check` and `lint` clean.
- [ ] **Step 7: Commit** `chore: scaffold pnpm workspace and svelte-chat-aide package`.

---

### Task 2: Shared limits, types, config schema, strings

Spec: §3.5 (limits, ceilings), §5 (config), §3.2 (gateway refusal), §3.6 (store requires salt), §3.8 (strings).

**Files:**
- Create: `src/lib/shared/limits.ts`, `src/lib/shared/types.ts`, `src/lib/shared/schemas.ts`, `src/lib/shared/strings.ts`
- Test: `tests/unit/shared/limits.test.ts`, `tests/unit/shared/schemas.test.ts`

**Interfaces — Produces:**
```ts
// limits.ts
export const LIMIT_DEFAULTS = { pageChars: 12_000, minPageChars: 200, outlineChars: 6_000, historyTurns: 12,
  historyChars: 16_000, maxOutputTokens: 1_024, maxSteps: 3, messageChars: 4_000, messages: 60,
  maxPages: 200, crawlConcurrency: 4, crawlBudgetMs: 1_500 } as const;
export const LIMIT_CEILINGS = { pageChars: 50_000, minPageChars: 5_000, outlineChars: 40_000, historyTurns: 50,
  historyChars: 100_000, maxOutputTokens: 8_192, maxSteps: 8, messageChars: 20_000, messages: 200,
  maxPages: 5_000, crawlConcurrency: 16, crawlBudgetMs: 10_000 } as const;
export type LimitName = keyof typeof LIMIT_DEFAULTS;
export type Limits = Record<LimitName, number>;
export const RATE_LIMIT_DEFAULTS = { requests: 20, windowSeconds: 600, warmups: 60 } as const;
export const BUDGET_DEFAULTS = { tokensPerDay: 200_000, siteTokensPerDay: 5_000_000 } as const;
export const CACHE_DEFAULTS = { ttlSeconds: 3600, missSeconds: 60 } as const;
export const MAX_REDIRECTS = 3;
export const MAX_ROUTE_LENGTH = 512;

// types.ts
export interface Store { incr(key: string, by: number, ttlSeconds: number): Promise<number>;
  get(key: string): Promise<string | null>; set(key: string, value: string, ttlSeconds: number): Promise<void>; }
export interface Heading { level: 1 | 2 | 3; text: string }
export interface Page { route: string; title: string; description?: string; headings: Heading[]; text: string }
export interface PageEntry extends Page { hash: string; thin: boolean; source: 'render' | 'markdown' | 'llms-full' | 'source'; fetchedAt: number }
export type ProviderConfig = { name: string; model: string; apiKey?: string; baseURL?: string; headers?: Record<string,string>;
  options?: Record<string, unknown>; region?: string; accessKeyId?: string; secretAccessKey?: string; sessionToken?: string;
  project?: string; location?: string; credentials?: unknown; resourceName?: string; apiVersion?: string;
  routing?: Record<string, unknown>; instance?: unknown /* LanguageModel, for name 'custom' */ };
export interface Persona { name?: string; tone?: string; language?: string; audience?: string; refusals?: string[] }
export interface PromptContext { route: string; site: { title: string; summary?: string }; persona?: Persona }
export type ErrorCode = 'invalid_request' | 'origin_refused' | 'rate_limited' | 'budget_exhausted' | 'unauthorized' | 'provider_error' | 'method_not_allowed';
export interface AideRequestMeta { route: string; sessionId: string; dom: string | null }
export interface WarmupResponse { pageSource: 'server' | 'dom'; suggestions: string[]; mapped: boolean }
export interface Usage { inputTokens?: number; outputTokens?: number; totalTokens?: number;
  inputTokenDetails?: { noCacheTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number };
  outputTokenDetails?: { textTokens?: number; reasoningTokens?: number } }
export interface MessageEvent { sessionId: string; route: string; text: string; at: Date }
export interface ResponseEvent { sessionId: string; route: string; text: string; usage: Usage; model: string; provider: string;
  durationMs: number; finishReason: string; toolCalls: { name: string; input: unknown }[]; at: Date }
export interface RefusedEvent { sessionId: string | null; code: ErrorCode; at: Date }
export interface ErrorEvent { sessionId: string | null; error: unknown; at: Date }
export type AideConfig = { /* exactly spec §5, plus suggestions?: string[] | Record<string,string[]> for the warm-up */ };
export type ResolvedConfig = /* AideConfig with every default filled: limits: Limits; rateLimit: {...}|false; budget: {tokensPerDay:number|false; siteTokensPerDay:number|false}|false; endpoint; cache; pageContext; caching; llms: {read,preferMarkdown,serve,serveSource} all booleans; pages: {include:string[]; exclude:string[]; source?} */;

// schemas.ts
export class AideConfigError extends Error { path: string }
export function resolveConfig(input: unknown): ResolvedConfig;   // throws AideConfigError('<path>: <reason>')
export function createBodySchema(limits: Limits): z.ZodType<AideBody>; // route shape only; route rule applied by handler
export interface AideBody { id?: string; messages: UIMessageLike[]; aide: AideRequestMeta }
export interface UIMessageLike { id?: string; role: 'user' | 'assistant'; parts: { type: string; text?: string }[] }

// strings.ts
export const DEFAULT_STRINGS: { greeting; placeholder; send; stop; retry; open; close; title; disclosure(provider:string):string; copy; copied; errors: Record<ErrorCode | 'network', string> };
export const REFUSAL_MESSAGES: Record<ErrorCode, string>;
export type Strings = typeof DEFAULT_STRINGS;
```

**Required behaviour (each a test):**
1. `resolveConfig({ provider: { name:'anthropic', model:'m', apiKey:'k' } })` returns every default of §3.5/§5 (`endpoint '/api/chat'`, `pageContext 'auto'`, `caching true`, `llms {read:true, preferMarkdown:true, serve:true, serveSource:false}`, `cache.ttlSeconds 3600`, `rateLimit {20,600,60}`, `budget {200000, 5000000}`).
2. Every limit accepts a developer value (loop over `LIMIT_DEFAULTS`, pass ceiling-1 and 1 → resolved).
3. Every limit above its ceiling throws with path `limits.<name>`; the same value passes when `limitCeilings: { <name>: value }`.
4. `rateLimit: false`, `budget: false`, `budget: { tokensPerDay: false }` accepted.
5. `provider.name: 'gateway'` throws a message containing `Vercel AI Gateway is not supported` and a reason sentence (routes requests through Vercel).
6. `store` without `salt` throws at path `salt`; `salt` without `store` throws at path `store`.
7. `provider.model` missing throws at `provider.model`; unknown top-level key throws (strict object).
8. `origin` must parse as a URL origin (no path) — `'https://x.dev/'` normalised to `'https://x.dev'`; `'https://x.dev/a'` throws.
9. Body schema: rejects >`messages` messages, a text part >`messageChars`, role `system`, `dom` > `pageChars`, missing `aide.route`; error carries the failing path.

- [ ] Steps: write tests (1–9) → run `pnpm --filter svelte-chat-aide exec vitest run tests/unit/shared` (FAIL) → implement → PASS → commit `feat(shared): limits, config schema and strings`.

---

### Task 3: The route rule

Spec: §3.6 "One route rule", §3.4 excludes, acceptance #7, #21.

**Files:** Create `src/lib/site/route.ts`; Test `tests/unit/site/route.test.ts`

**Interfaces — Produces:**
```ts
export const IN_PROCESS_ORIGIN = 'http://aide.internal';
export const DEFAULT_EXCLUDES: string[]; // ['/api/**'] + extension rule + side-effect last segments
export const SIDE_EFFECT_SEGMENTS = ['logout','logoff','signout','sign-out','unsubscribe','delete','remove'];
/** Returns the normalized pathname, or null when refused. Never throws. */
export function normalizeRoute(input: unknown, origin?: string): string | null;
/** Glob: `*` one segment, `**` any depth, exact otherwise. */
export function matchesPattern(pathname: string, pattern: string): boolean;
export function isExcluded(pathname: string, exclude: string[]): boolean; // user excludes + defaults
/** normalizeRoute + !isExcluded */
export function acceptRoute(input: unknown, opts: { origin?: string; exclude: string[] }): string | null;
/** For absolute hrefs from crawled pages / sitemap <loc> / llms.txt / Location headers: resolves against base, requires same origin, returns acceptRoute(pathname). */
export function acceptHref(href: string, opts: { origin?: string; base: string; exclude: string[] }): string | null;
```

**Rules (in order):** string; length ≤ 512; starts with exactly one `/` (`//` refused); no `\` anywhere; no `%2f %5c %2e` (case-insensitive); no control chars (`/[\u0000-\u001f\u007f]/`); `new URL(route, origin ?? IN_PROCESS_ORIGIN)` parses and `.origin === (origin ?? IN_PROCESS_ORIGIN)`; return `.pathname` (query/hash dropped, dot segments resolved). Extension rule: last segment contains a `.` followed by 1–8 alnum chars → excluded (but `.md` twin requests are built by readPage, not accepted as routes).

**Tests:** refused (normalizeRoute or acceptRoute → null): `//evil.example/x`, `//169.254.169.254/latest/meta-data/`, `/\evil.example`, `/a/../api/x` (excluded after normalizing), `/%2e%2e/api/x`, `/%2F%2Fevil.example`, `http://evil.example/`, `''`, `'x'`, `123`, `null`, 513-char route, `/a\u0000b`, `/logout`, `/account/sign-out`, `/files/report.pdf`, `/api/chat`. Accepted: `/` → `/`, `/docs/intro?x=1#h` → `/docs/intro`, `/docs/./a` → `/docs/a`, `/a/b/../c` → `/a/c`. `acceptHref('https://site.dev/p?q', {origin:'https://site.dev', base:'https://site.dev/', exclude:[]})` → `/p`; `acceptHref('https://other.dev/p', …)` → null; with `origin` undefined and base `IN_PROCESS_ORIGIN`, relative `href="/p"` → `/p`. User exclude `/private/**` refuses `/private/a/b`; `*` matches one segment only.

- [ ] Steps: tests → FAIL → implement → PASS → commit `feat(site): single route rule`.

---

### Task 4: Provider registry and fromEnv

Spec: §3.2 in full, acceptance #4, #18. (Folds L6's full registry in: each row is data.)

**Files:** Create `src/lib/server/providers.ts`, `src/lib/server/from-env.ts`; Test `tests/unit/server/providers.test.ts`, `tests/unit/server/from-env.test.ts`

**Interfaces — Consumes:** `ProviderConfig` (Task 2). **Produces:**
```ts
export type CacheMarker = 'anthropic' | 'bedrock' | 'none';
export interface ProviderRow {
  name: string; aliases?: string[]; pkg: string; factory: string;       // e.g. 'createAnthropic'
  preset?: { baseURL: string; keyless?: boolean; providerName: string };  // for openai-compatible presets
  credentials: 'apiKey' | 'none' | 'azure' | 'vertex' | 'bedrock' | 'openai-compatible' | 'custom';
  envRequired: string[];   // SVELTE_CHAT_AIDE_* names required by fromEnv for this row
  cache: CacheMarker;
}
export const PROVIDERS: readonly ProviderRow[];               // every row of both §3.2 tables
export function findProvider(name: string): ProviderRow | undefined; // handles aliases gemini->google, moonshot->kimi
export interface LoadedProvider { row: ProviderRow; model: LanguageModel /* object, has .provider */; providerName: string; modelId: string }
export type Importer = (pkg: string) => Promise<Record<string, unknown>>;
/** Dynamic import of the adapter; throws Error containing `pnpm add <pkg>` when missing. */
export async function loadProvider(cfg: ProviderConfig, importer?: Importer): Promise<LoadedProvider>;

export function fromEnv(env: Record<string, string | undefined>): ProviderConfig;
```
Factory construction: `factory({ apiKey, baseURL, headers, ...options })` (plus row-specific credential fields: azure `resourceName`/`apiVersion`; vertex `project`/`location`/`googleAuthOptions.credentials`; bedrock `region`/`accessKeyId`/`secretAccessKey`/`sessionToken`; openrouter passes `routing` as `extraBody.provider`? — check the adapter's d.ts and pass provider preferences the adapter's documented way); then `provider(model)` (for openai-compatible: `createOpenAICompatible({ name: preset.providerName, baseURL, apiKey, headers }).chatModel(model)`). `custom` returns `cfg.instance` after asserting it is an object with `provider` and `modelId`. Undefined fields are omitted (so Bedrock/Vertex fall back to default chains).

**Tests:**
1. Registry walk: for every row, `loadProvider` with the real importer (all adapters are devDependencies) and dummy credentials returns `model` where `typeof model === 'object' && typeof model.provider === 'string'`. Vertex/Bedrock with dummy project/region. `custom` with `new MockLanguageModelV4()` from `ai/test`.
2. No row's `name`, alias or `pkg` contains `gateway`; `findProvider('gateway')` undefined.
3. Missing adapter: importer that throws `ERR_MODULE_NOT_FOUND` → error message contains `pnpm add @ai-sdk/anthropic`.
4. Anthropic row `cache === 'anthropic'`, bedrock `'bedrock'`, others `'none'`.
5. `globalThis.AI_SDK_DEFAULT_PROVIDER` is `undefined` after loading every row.
6. fromEnv: a recording `Proxy` over the env object; for every row, supply exactly its `envRequired` + PROVIDER + MODEL and assert the result `findProvider(name)` loads; assert every recorded key starts with `SVELTE_CHAT_AIDE_` and is in the §3.2 table; removing each required variable throws naming it; unknown provider throws naming `SVELTE_CHAT_AIDE_PROVIDER`; `SVELTE_CHAT_AIDE_OPTIONS='{"a":1}'` → `options {a:1}`, invalid JSON throws naming the variable; `ANTHROPIC_API_KEY` present in env is never read; `{ ...fromEnv(env), model: 'x' }` has model `x`.

- [ ] Steps: tests → FAIL → implement → PASS → commit `feat(server): provider registry and fromEnv`.

---

### Task 5: Prompt assembly and history windowing

Spec: §3.3 in full, acceptance #5 (offline part), #6.

**Files:** Create `src/lib/server/prompt.ts`, `src/lib/server/window.ts`; Test `tests/unit/server/prompt.test.ts`, `tests/unit/server/window.test.ts`

**Interfaces — Consumes:** `Persona`, `PromptContext`, `CacheMarker`, `Limits`, `UIMessageLike`. **Produces:**
```ts
export const defaultSystemPrompt: string;
export interface PromptInput {
  systemPrompt?: string | ((ctx: PromptContext) => string); persona?: Persona; facts?: string | string[];
  outline: string; outlinePartial: boolean; ctx: PromptContext;
  page: { route: string; title?: string; text: string } | null; history: ModelMessage[]; // already windowed, last = visitor message
  cache: CacheMarker; caching: boolean; pageChars: number;
}
export interface BuiltPrompt { instructions: SystemModelMessage[]; messages: ModelMessage[]; prefixText: string }
export function buildPrompt(input: PromptInput): BuiltPrompt;
export function windowHistory(messages: UIMessageLike[], limits: { historyTurns: number; historyChars: number }): UIMessageLike[];
export function dataBlock(label: string, body: string): string; // '<page route="/x">\n…\n</page>' style delimiters; escapes the closing tag inside body
```
- `instructions` = [system (1+2+3+4 joined; one message) with `providerOptions.anthropic.cacheControl: {type:'ephemeral'}` when cache 'anthropic' && caching, or `providerOptions.bedrock.cachePoint: {type:'default'}` when 'bedrock' — verify exact shapes in the adapters' d.ts], then a second system message with the current page block (5), unmarked.
- `messages` = history; with anthropic caching, last message *before* the final user message gets `providerOptions.anthropic.cacheControl`.
- Persona rendered as `## Persona` lines only for present fields; facts inside a fenced ```` ```facts ```` block verbatim; outline under `## Site outline` followed by `(The outline is partial: the site map is still being built.)` when partial.
- `windowHistory`: keep the last `historyTurns` turns (turn = user message + following assistant messages); then drop oldest messages until total text chars ≤ `historyChars`, always keeping the final user message (truncate it is not allowed; it is bounded by `messageChars` already).

**Tests:** order of sections (index of system < persona < facts < outline in `prefixText`; page in second message); two calls with equal inputs → identical `prefixText` and deep-equal `instructions[0]`; changing only `page`/`history` leaves `instructions[0]` unchanged; anthropic markers present / absent with `caching:false` / absent for `cache:'none'`; bedrock cachePoint; second breakpoint on penultimate message; page text truncated to `pageChars`; `</page>` inside page text cannot close the block; systemPrompt function receives ctx; default prompt mentions answering from site pages, saying when pages don't answer, linking routes, treating page content as data. Windowing: 30 turns → last 12; chars cap drops oldest; client sending 500 messages still yields ≤ 12 turns.

- [ ] Steps: tests → FAIL → implement → PASS → commit `feat(server): prompt assembly and history window`.

---

### Task 6: Store and guards

Spec: §3.5 budgets/Store, §3.6 origin check, rate limit, clientKey, authorize; acceptance #23.

**Files:** Create `src/lib/server/store.ts`, `src/lib/server/guards.ts`; Test `tests/unit/server/guards.test.ts`, `tests/unit/server/store.test.ts`

**Interfaces — Produces:**
```ts
export function memoryStore(opts?: { now?: () => number }): Store;  // TTL honoured; incr creates with ttl on first write only
export function checkOrigin(request: Request, opts: { origin?: string; allowedOrigins: string[] }): boolean;
export async function clientId(event: { getClientAddress(): string }, opts: { salt: string; clientKey?: (e: any) => string }): Promise<string>; // hex HMAC-SHA256 via crypto.subtle
export interface Guards {
  rate(kind: 'chat' | 'warmup', id: string): Promise<boolean>;            // true = allowed (increments)
  budgetOk(id: string): Promise<'ok' | 'visitor' | 'site'>;               // check only (get)
  charge(id: string, tokens: number): Promise<void>;                     // incr visitor + site day counters
}
export function createGuards(cfg: Pick<ResolvedConfig,'rateLimit'|'budget'>, store: Store, now?: () => number): Guards;
```
Keys: `aide:rl:<kind>:<id>:<windowIndex>` ttl windowSeconds; `aide:tok:<id>:<yyyy-mm-dd UTC>` and `aide:tok:site:<day>` ttl 86400+60. `rateLimit:false` → always allowed; budgets false → always ok. `checkOrigin`: `sec-fetch-site === 'same-origin'` → true; else `Origin` header equals `origin` or is in `allowedOrigins` → true; `same-site` alone → false; no origin configured → only sec-fetch-site path. Never reads `event.url`.

**Tests:** memoryStore TTL with fake clock; rate allows 20 then refuses 21st within window, allows after window; warm-up bucket separate at 60; budgets: visitor over 200k → 'visitor'; site-wide: charge 50 distinct ids × 100k → 51st distinct id gets 'site' (acceptance #23); custom values honoured; `false` disables. checkOrigin matrix (same-origin ✓, same-site ✗, cross-site with matching Origin ✓, forged Host irrelevant, allowedOrigins ✓, nothing configured + Origin header ✗). clientId: same address → same id; different salt → different id; output never contains the address; `clientKey` used when given.

- [ ] Steps: tests → FAIL → implement → PASS → commit `feat(server): store, origin check, rate limit and budgets`.

---

### Task 7: Background work and callbacks

Spec: §3.4 Background work, §3.7, acceptance #22.

**Files:** Create `src/lib/server/background.ts`; Test `tests/unit/server/background.test.ts`

**Interfaces — Produces:**
```ts
export type WaitUntil = (p: Promise<unknown>) => void;
/** platform.context.waitUntil (Cloudflare/Netlify) → @vercel/functions waitUntil (dynamic import, cached; only if the import resolves) → config.waitUntil → fire-and-forget */
export async function resolveWaitUntil(event: { platform?: any } | null, configured?: WaitUntil): Promise<WaitUntil>;
export function isLikelyServerless(): boolean;  // checks platform env markers passed in? -> accept an env object param; default reads nothing: signature (env?: Record<string,string|undefined>) and handler passes nothing -> false. (Warn logic lives in handler.)
export function runCallback<T>(waitUntil: WaitUntil, fn: ((arg: T) => unknown) | undefined, arg: T,
  onError?: (e: { sessionId: string | null; error: unknown; at: Date }) => unknown, sessionId?: string | null): void;
```
`runCallback`: starts fn on a microtask (never synchronously delays caller), wraps in promise, catches throw/rejection and hands it to `onError` (whose own throw/rejection is swallowed), passes the whole promise to `waitUntil`.

**Tests:** platform waitUntil preferred; configured used when platform lacks; fallback doesn't throw; runCallback never throws synchronously even if fn throws synchronously; rejection reaches onError with sessionId; onError throwing is swallowed (no unhandled rejection — use `process.on('unhandledRejection')` spy); the promise given to waitUntil resolves after fn completes.

- [ ] Steps: tests → FAIL → implement → PASS → commit `feat(server): waitUntil resolution and safe callbacks`.

---

## Phase B — Site map (L2)

### Task 8: Extractor

Spec: §3.4 Extraction rules; shared with the widget.

**Files:** Create `src/lib/site/extract.ts`, `src/lib/extract/index.ts` (re-export); Test `tests/unit/site/extract.test.ts`, fixtures `tests/fixtures/html/*.html`

**Interfaces — Produces:**
```ts
export interface Extracted { title: string; description?: string; headings: Heading[]; text: string }
/** Pure DOM walk; works on linkedom's Document and a browser Document. Does not mutate the input (clone first). */
export function extract(doc: Document): Extracted;
export function isThin(text: string, minPageChars: number): boolean;
export function hashText(text: string): string; // FNV-1a 64 hex, sync, no node:crypto (browser-safe)
```
Rules: root = `[data-aide]` subtrees if any exist (concatenated), else `<main>` else `<body>`; drop `[data-aide-ignore]`, `nav, aside, script, style, noscript, template, [aria-hidden="true"]`; drop `header`/`footer` only when no ancestor is `main, article, section`; title from `<title>` (fallback first h1); description from `meta[name=description]`; headings h1–h3 from kept content; block elements separate text with newlines/spaces, whitespace collapsed (single spaces inside, `\n` between blocks, trimmed).

**Tests** run each fixture through linkedom (`parseHTML`) AND happy-dom (`new Window().document` with `document.write`/`body.innerHTML`) and assert identical `Extracted`: main vs body; data-aide-ignore dropped; nav/aside/script/style/noscript/template/aria-hidden dropped; landmark header/footer dropped but `<article><header><h1>Title` kept; `[data-aide]` exclusive; meta description; heading levels; whitespace collapse; input doc unchanged; `isThin` threshold; hash stable.

- [ ] Steps: fixtures+tests → FAIL → implement → PASS → commit `feat(site): shared extractor`.

---

### Task 9: Transport and page cache

Spec: §3.4 Reading one page, What is cached, origin, acceptance #13, #19, #26, #27.

**Files:** Create `src/lib/site/transport.ts`, `src/lib/site/cache.ts`; Test `tests/unit/site/transport.test.ts`, `tests/unit/site/cache.test.ts`

**Interfaces — Consumes:** `acceptHref`, `IN_PROCESS_ORIGIN`, `MAX_REDIRECTS`, `Store`, `PageEntry`. **Produces:**
```ts
export const INTERNAL_HEADER = 'x-aide-internal';
export const INTERNAL_MARKER: string;               // crypto.randomUUID() per process
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
export interface ReadResult { ok: true; status: 200; contentType: 'html' | 'markdown' | 'text'; body: string; finalRoute: string }
export interface ReadMiss { ok: false; status: number; reason: 'status' | 'redirect' | 'content-type' | 'network' }
export interface Transport { read(path: string, accept?: string): Promise<ReadResult | ReadMiss>; setInProcessFetch(f: FetchLike): void }
/** in-process: relative path via the last event.fetch; network fallback (only when origin configured and in-process missing or returned 404 for a prerendered route): globalThis.fetch(origin + path). Every call: credentials 'omit', new Headers({accept, [INTERNAL_HEADER]: INTERNAL_MARKER}), redirect 'manual'. 3xx followed only if acceptHref(Location) passes (same origin + not excluded), max 3 hops. */
export function createTransport(opts: { origin?: string; exclude: string[]; networkFetch?: FetchLike }): Transport;

export interface PageCache {
  get(route: string): Promise<{ entry: PageEntry; stale: boolean } | { miss: true } | null>;
  set(route: string, entry: PageEntry): Promise<void>;
  setMiss(route: string): Promise<void>;           // 60 s, no body
  size(): number; routes(): string[];              // LRU order, most recent last
}
export function createPageCache(opts: { maxPages: number; ttlSeconds: number; missSeconds?: number; store?: Store; now?: () => number }): PageCache;
```
Content types: `text/html` → html, `text/markdown`/`text/x-markdown` → markdown, `text/plain` → text (used for llms.txt reads); anything else → miss 'content-type'. Stale = older than TTL (entry retained until evicted; SWR logic lives in readPage). LRU counts entries AND misses together, bounded by maxPages. With a Store: entries also written as JSON under `aide:page:<route>` (ttl = 2×ttlSeconds), misses under `aide:miss:<route>` (60 s); `get` consults memory then store.

**Tests:** spy fetch records init: `credentials === 'omit'`, headers are exactly `{accept, x-aide-internal}` even when the event fetch would forward cookies (use a fetch spy that fails the test if `cookie`/`authorization` present); `redirect === 'manual'`; foreign Location → miss 'redirect', no second call; 4 same-site hops → miss after 3 follows; `/go/github` → Location `https://github.com` → miss, spy never sees github; excluded Location (`/logout`) → miss; non-200 → miss status; `image/png` → miss content-type; with no origin configured and in-process fetch unset → miss 'network' with zero global fetch calls; configured origin: network fetch hits only `origin + path`. Forged Host: transport never reads request Host (it has no access) — test that `createTransport({origin:'https://site.dev'})` with network fetch spy only ever requests `https://site.dev/...`. Cache: LRU evicts at maxPages; 10 000 invented misses → `size() ≤ maxPages`; miss expires after 60 s fake clock; TTL staleness flag; store round-trip.

- [ ] Steps: tests → FAIL → implement → PASS → commit `feat(site): cookie-less transport and bounded page cache`.

---

### Task 10: llms.txt parse and render

Spec: §3.4 llms.txt read and served, acceptance #17, #28; https://llmstxt.org grammar (H1, optional `>` blockquote summary, optional paragraphs, `##` sections of `- [title](url): description`).

**Files:** Create `src/lib/site/llms.ts`; Test `tests/unit/site/llms.test.ts`

**Interfaces — Produces:**
```ts
export interface LlmsLink { title: string; url: string; description?: string; optional: boolean; section: string }
export interface LlmsDoc { title: string; summary?: string; details?: string; links: LlmsLink[] }
export function parseLlmsTxt(text: string): LlmsDoc;
export function splitLlmsFull(text: string, knownRoutes?: string[]): { route?: string; title: string; text: string }[]; // splits at '# ' page headings; route from a following 'Source: <url>' / 'URL: <url>' line when present, else matched by title against knownRoutes
export interface MapPage { route: string; title: string; description?: string; headings: Heading[]; text: string; fromSource: boolean }
export function renderLlmsTxt(site: { title: string; summary?: string }, pages: MapPage[], opts: { exclude: string[]; serveSource: boolean }): string;
export function renderLlmsFull(site, pages, opts): string;
export function renderPageMarkdown(page: MapPage): string;           // '# title\n\n> description\n\n' + text
export function markdownPathFor(route: string): string;              // '/' -> '/index.html.md', '/a/' -> '/a/index.html.md', '/a' -> '/a.md'
export function routeForMarkdownPath(path: string): string | null;   // inverse; null if not a .md path
export function outlineFrom(site, pages, opts: { maxChars: number; withHeadings: boolean }, base?: LlmsDoc): { text: string; cut: boolean };
```
Render: `# <title>\n\n> <summary>\n\n` then one `## <Section>` per top-level path segment (root `/` under `## Pages`, section name = segment title-cased), each page `- [title](route): description`. Outline: same format; page headings indented under each link while `maxChars` allows; with a site-provided `base` doc, use it verbatim; if over `maxChars` cut at the last whole link line, dropping `## Optional` section lines first, append `\n(outline cut)`.

**Tests:** parse the llmstxt.org example (title, summary, sections, Optional flag, descriptions); render → parse round-trip preserves every page; excluded pages absent; `fromSource` pages absent unless `serveSource`; `markdownPathFor` table; outline cut drops Optional first then cuts at whole line; `splitLlmsFull` splits fixture into pages.

- [ ] Steps: tests → FAIL → implement → PASS → commit `feat(site): llms.txt parser and renderers`.

---

### Task 11: readPage and the site map crawl

Spec: §3.4 whole section, acceptance #15, #16, #20, #21, #27.

**Files:** Create `src/lib/site/read-page.ts`, `src/lib/site/site-map.ts`; Test `tests/unit/site/read-page.test.ts`, `tests/unit/site/site-map.test.ts`, fixture app `tests/fixtures/site.ts` (an in-memory fake site: `(path, init) => Response` map, recording every call).

**Interfaces — Consumes:** Transport, PageCache, extract/hashText/isThin, llms functions, acceptHref, WaitUntil. **Produces:**
```ts
export interface Reader { readPage(route: string, opts?: { waitUntil?: WaitUntil }): Promise<PageEntry | null> }
/** cache hit fresh → entry; stale → entry + background refresh via waitUntil; miss-cached → null; else: if preferMarkdown try `markdownPathFor(route)` (accept text/markdown) → entry source 'markdown'; else HTML → linkedom parseHTML → extract → entry. Concurrent reads of one route share one promise. Text truncated to pageChars. */
export function createReader(opts: { transport: Transport; cache: PageCache; limits: Limits; preferMarkdown: boolean; now?: () => number }): Reader;
/** Returns links found in the last HTML read of a route (hrefs not rel=nofollow), for the crawler. */
// (Reader also exposes) links(route: string): string[]

export interface SiteMap {
  ensureStarted(waitUntil: WaitUntil): void;                 // idempotent; starts crawl on first call
  waitFor(ms: number): Promise<void>;                        // resolves when complete or after ms
  complete(): boolean;
  site(): { title: string; summary?: string };
  pages(): MapPage[];                                        // mapped pages, in crawl/llms order
  outline(maxChars: number): { text: string; partial: boolean };
  readForTool(route: string): Promise<PageEntry | null>;      // pages.source when set, else reader
  isMapped(route: string): boolean;
}
export function createSiteMap(opts: { reader: Reader; transport: Transport; cache: PageCache; config: ResolvedConfig; now?: () => number }): SiteMap;
```
Crawl: if `llms.read`, read `/llms.txt` (accept text/plain, text/markdown): summary → site summary, links → seeds in order (Optional last), descriptions prefill map entries; read `/llms-full.txt` and put split pages in cache (source 'llms-full'). Seeds: `/`, `/sitemap.xml` `<loc>`s via `acceptHref`, `pages.include`, then llms links. BFS with `crawlConcurrency` in flight, stop at `maxPages`, links via `acceptHref` (query/hash dropped, nofollow skipped, excludes incl. side-effect segments). `pages.source` set → no crawl; `pages()` = source result (fromSource true). Site title = root page title or llms.txt H1; summary = llms.txt summary ?? facts ?? root description. TTL revisit: `ensureStarted` re-runs crawl when older than ttlSeconds.

**Tests (with the fake site):** crawl bounded by maxPages; concurrency never exceeds limit (track in-flight in fake); no recorded URL has `?` or `#`; `/logout`, `/delete`, `/api/x`, `/file.pdf`, nofollow links never requested (acceptance #21); sitemap locs on foreign origin ignored; llms.txt present → `outline()` complete before any page render besides none (fake records zero HTML reads) — acceptance #16; `.md` twin present → entry.source 'markdown' and no HTML request for that route; llms-full split fills cache so `readForTool` makes no request; site without llms files: reads of `/llms.txt` return 404 and are made exactly once with the marker header (acceptance #20 — the fake asserts marker present); unknown route read once, 404 miss cached, second ask within 60 s makes no request; `pages.source` → no crawl request at all; stale entry served immediately and refreshed in background via waitUntil spy; outline marks partial while crawl running.

- [ ] Steps: tests → FAIL → implement → PASS → commit `feat(site): readPage and run-time site map`.

---

## Phase C — Endpoint and hook (L1/L2/L5)

### Task 12: createChatHandler

Spec: §3.3, §3.4 widget part, §3.5, §3.6, §3.7, §6; acceptance #8, #11, #14, #22, #24, #7 (body/GET part).

**Files:** Create `src/lib/server/handler.ts`, `src/lib/server/read-page-tool.ts`; Test `tests/unit/server/handler.test.ts`, `tests/unit/server/telemetry.test.ts`

**Interfaces — Consumes:** everything from Tasks 2–11. **Produces:**
```ts
export interface ChatHandler {
  (event: RequestEvent): Promise<Response>;        // GET warm-up, POST chat, other → 405
  config: ResolvedConfig; siteMap: SiteMap; transport: Transport;
}
export function createChatHandler(config: AideConfig, deps?: { importer?: Importer; now?: () => number }): ChatHandler;
```
Creation: `resolveConfig`; `loadProvider` (lazy promise created at creation, awaited per request, so missing adapter throws on first request AND a `ready: Promise<void>` rejects — test awaits `ready`); memoryStore + random salt when no store; warn once when no platform waitUntil and no config.waitUntil is detectable is deferred to first request (warn helper).
Per request order: `transport.setInProcessFetch(event.fetch)` → method check (405 `method_not_allowed`) → `checkOrigin` (403 `origin_refused`) → `authorize` (false → 403 `unauthorized`; Response → returned) → rate (`warmup` for GET, `chat` for POST; 429 `rate_limited`) → GET: `acceptRoute(url.searchParams.get('route'))` or 400; `siteMap.ensureStarted`; `reader.readPage(route)`; respond `{ pageSource: pageContext==='dom' || (auto && (!entry || entry.thin)) ? 'dom' : 'server', suggestions, mapped }`. POST: parse JSON + body schema (400 `invalid_request` `{error, message, path}`), `acceptRoute(aide.route)` (400), `budgetOk` (429 `budget_exhausted`), `ensureStarted` + `waitFor(crawlBudgetMs)`, current page: server entry or `dom` per §3.6 rule (dom used only when pageContext 'dom' or auto+thin; never cached), `windowHistory`, `convertToModelMessages`, `buildPrompt`, `streamText({ model, instructions, messages, tools: { read_page }, stopWhen: isStepCount(maxSteps), maxOutputTokens, telemetry: { isEnabled: false }, onEnd, onError })`, respond `createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) })`. Provider error before the stream starts → 502 `provider_error`; mid-stream → the stream's error part carries only the generic sentence (use `toUIMessageStream`'s `onError` returning `REFUSAL_MESSAGES.provider_error`). `onMessage` fired after validation; `onEnd` → `charge(id, input+output)` + `onResponse` with summed usage, `toolCalls`, `durationMs`, `finishReason`, all through `runCallback(waitUntil …)`. Every refusal fires `onRefused`. `read_page` tool: `tool({ description, inputSchema: z.object({ route: z.string() }), execute })` → `acceptRoute` fail → `"Not a page of this site."` (no read); else `siteMap.readForTool` → text bounded by pageChars in a data block, or `"No readable page at <route>."`.

**Tests (MockLanguageModelV4, fake site from Task 11 fixture as event.fetch):** streaming happy path (response is UI message stream, contains mock text); tool loop bounded by maxSteps (mock always calls tool); read_page refused set (acceptance #7 list) → "Not a page of this site." and fetch spy records no read; same inputs as `aide.route` and `GET ?route=` → 400 `invalid_request`, no read; unknown same-site route rendered once; origin refusal 403 + onRefused; body refusal 400 + onRefused; rate 429 + onRefused; budget 429 + onRefused; provider error (mock doStream throws with secret text) → 502, body lacks secret, onError receives the real error; onMessage and onResponse fire exactly once per turn with the mock's usage (acceptance #11); waitUntil mock that "ends the invocation" (records promises, handler response fully consumed, then awaits recorded promises) → onResponse fired (acceptance #22); model handed to streamText is an object (mock `doStream` spy sees provider object path; also grep test: `src/lib` contains `gateway` only in schemas.ts); DOM text used under auto only when thin, dropped otherwise, never present in `cache.routes()` entries afterwards (acceptance #14); forged Host header on request → fake site / network spy only sees configured origin (acceptance #19); history of 40 turns → model receives ≤ 12 turns (#6); 405 for PUT; GET warm-up shape. Telemetry test: register a global integration via the AI SDK's documented mechanism (`registerTelemetry` if exported, else `globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = [spy]`) and assert the spy records nothing after a full turn (acceptance #24).

- [ ] Steps: tests → FAIL → implement → PASS → commit `feat(server): chat handler`.

---

### Task 13: aide() hook, llms handlers, server entry

Spec: §3.1 hook rules, §3.4 serving, acceptance #17, #20, #28.

**Files:** Create `src/lib/server/hook.ts`, `src/lib/llms/index.ts`; Modify `src/lib/server/index.ts` (real exports); Test `tests/unit/server/hook.test.ts`

**Interfaces — Produces:**
```ts
// hook.ts
export function aide(config: AideConfig): Handle & { handler: ChatHandler };
// llms/index.ts — each returns a RequestHandler bound to a handler/site map
export function llmsTxt(handler: ChatHandler): RequestHandler;
export function llmsFullTxt(handler: ChatHandler): RequestHandler;
export function pageMarkdown(handler: ChatHandler): RequestHandler;  // reads params/pathname, maps via routeForMarkdownPath
// server/index.ts
export { aide, createChatHandler, fromEnv, memoryStore, defaultSystemPrompt };
export type { AideConfig, ProviderConfig, Store, Page, PromptContext, Usage, ... };
```
Hook logic: request has `x-aide-internal === INTERNAL_MARKER` → `resolve(event)` untouched. Path === endpoint, `/llms.txt`, `/llms-full.txt` or `routeForMarkdownPath(path)` non-null → `const res = await resolve(event)`; if `res.status !== 404` return it; else answer (endpoint → chat handler; llms docs only when `llms.serve`; `.md` only for mapped pages, `fromSource` pages only with `serveSource`, excluded routes never). Llms docs: `ensureStarted` + `waitFor(crawlBudgetMs)`, `content-type: text/markdown; charset=utf-8` (llms.txt `text/plain; charset=utf-8`), `cache-control: public, max-age=<ttl>`. Creation warning when the app manifest has a route at endpoint: try `import('$app/manifest')`-free approach — read `event`-less: use SvelteKit's `building`? Not available; instead warn at first request if `resolve` for the endpoint returned non-404 (document this deviation in docs/ and commit message). All other paths → `resolve(event)`.

**Tests:** marker request passes to resolve even for `/llms.txt`; app answering `/api/chat` 200 is not shadowed; app 404 on `/llms.txt` → generated doc listing every mapped page and no excluded one, parses with `parseLlmsTxt` (acceptance #17); `/docs/a.md` served for mapped page, 404 for unmapped/excluded; `pages.source` page absent from all three unless `serveSource` (acceptance #28); `llms.serve:false` → passthrough 404; library reads of `/llms.txt` through the hook (fake app whose resolve 404s) return 404 and never recurse (count hook invocations: each internal read resolves exactly once) (acceptance #20); `aide()` result composes with `sequence` from `@sveltejs/kit/hooks`.

- [ ] Steps: tests → FAIL → implement → PASS → `pnpm build` → commit `feat(server): aide hook and llms handlers`.

---

## Phase D — Widget (L3/L4)

### Task 14: Markdown to safe node tree

Spec: §3.6 What an answer may render, §3.8 markdown; acceptance #10.

**Files:** Create `src/lib/shared/markdown.ts`; Test `tests/unit/shared/markdown.test.ts`

**Interfaces — Produces:**
```ts
export type MdInline = { t: 'text'; v: string } | { t: 'code'; v: string } | { t: 'em' | 'strong' | 'del'; c: MdInline[] }
  | { t: 'link'; href: string; external: boolean; c: MdInline[] } | { t: 'br' };
export type MdBlock = { t: 'p'; c: MdInline[] } | { t: 'h'; level: 1|2|3|4|5|6; c: MdInline[] }
  | { t: 'list'; ordered: boolean; start?: number; items: MdBlock[][] } | { t: 'code'; lang?: string; v: string }
  | { t: 'quote'; c: MdBlock[] } | { t: 'hr' };
export interface MdOptions { origin: string; answerLinks: 'same-origin' | 'any' }
export function parseAnswer(md: string, opts: MdOptions): MdBlock[];  // uses marked.lexer only (never marked.parse)
```
Rules: image tokens (inline and reference) → `{t:'text', v: alt}` or nothing; `html` tokens → text of raw source; links: resolve `href` against origin; scheme not http/https → text children only; same origin → `{link, external:false, href: pathname+search+hash}`; other host → `'any'` ? `{link, external:true}` : text only; autolinks follow the same rule; tables → paragraphs of cell text (keep it simple).

**Tests (hostile corpus):** `<img src=x onerror=alert(1)>` → text; `<script>` → text; `[x](javascript:alert(1))`, `[x](JaVaScRiPt:…)`, `[x](data:text/html,…)`, `[x](vbscript:…)` → text; `![a](https://evil/x.png)` → text `a`; `![](https://evil/x.png)` → nothing; reference image `![a][r]\n\n[r]: https://evil/p.png` → text `a`; `[Privacy](/privacy)` → internal link `/privacy`; `https://other.dev` autolink under same-origin → text; under `any` → external link; JSON of output never contains `evil/x.png` for images; fenced code keeps lang; nested lists; headings.

- [ ] Steps: tests → FAIL → implement → PASS → commit `feat(shared): markdown to safe node tree`.

---

### Task 15: Headless store and components

Spec: §3.7 client callbacks, §3.8, §3.9 layer 1, §3.10; §6 wire.

**Files:** Create `src/lib/headless/create-chat.svelte.ts`, `src/lib/headless/{ChatWidget,ChatLauncher,ChatWindow,Transcript,Message,Markdown,MdInline,Composer}.svelte`, `src/lib/headless/focus-trap.ts`, `src/lib/headless/index.ts`; Test `tests/unit/headless/create-chat.test.ts` (vitest with happy-dom env via `// @vitest-environment happy-dom`)

**Interfaces — Produces:**
```ts
export interface ChatOptions {
  endpoint?: string; persistThread?: boolean; answerLinks?: 'same-origin' | 'any'; strings?: Partial<Strings>;
  suggestions?: string[] | Record<string, string[]>;
  onopen?(): void; onclose?(): void; onsend?(text: string): void; onresponse?(text: string, usage?: Usage): void; onerror?(code: string): void;
  fetch?: typeof fetch;
}
export interface ChatStore {
  readonly messages: UIMessage[]; readonly status: 'ready' | 'submitted' | 'streaming' | 'error';
  readonly error: { code: string; message: string } | null; readonly isOpen: boolean; readonly suggestions: string[];
  readonly strings: Strings; readonly route: string; readonly answerLinks: 'same-origin' | 'any';
  send(text: string): Promise<void>; stop(): void; retry(): Promise<void>; open(): void; close(): void; toggle(): void;
  warmup(route: string): Promise<void>;   // GET endpoint?route=; stores pageSource and server suggestions
  sessionId: string;
}
export function createChat(options?: ChatOptions): ChatStore;
```
Implementation: `new Chat({ transport: new DefaultChatTransport({ api: endpoint, prepareSendMessagesRequest }) })` from `@ai-sdk/svelte`/`ai` (verify names); request body adds `aide: { route: location.pathname, sessionId, dom: pageSource==='dom' ? domText() : null }` where `domText()` = `extract(document).text` sliced to 12 000; sessionId `crypto.randomUUID()` in `sessionStorage['aide:session']`; thread persisted in `sessionStorage['aide:thread']` when `persistThread` (try/catch); refusal JSON → `error.code` + sentence from server `message`; `onresponse` when status goes streaming→ready; `window.dispatchEvent(new CustomEvent('aide:open'|'aide:close'|'aide:send'|'aide:response'|'aide:error', { detail }))`. Warm-up on `open()` and on `afterNavigate` (in ChatWidget component, not store).
Components render only structure with `data-part` (`launcher`, `window`, `header`, `title`, `close`, `transcript`, `message` + `data-role`, `markdown`, `code`, `copy`, `suggestions`, `suggestion`, `composer`, `input`, `send`, `stop`, `retry`, `error`, `disclosure`) and accept `class` props. A11y: launcher `<button aria-label={strings.open} aria-expanded aria-controls>`; window `role="dialog" aria-modal="true" aria-labelledby`; focus trap (Tab/Shift+Tab cycle), `Escape` closes and returns focus to launcher; transcript `aria-live="polite"` with streaming text in an `aria-busy` region, and a visually-hidden status node that receives the full answer once when streaming finishes; `ChatWidget` props = §3.8 list; `launcher` snippet `{ open, toggle }` replaces the default launcher; `enabled={false}` renders nothing; `open` `$bindable`. Markdown component renders `MdBlock[]` recursively; internal links `onclick` → `goto(href)` with `preventDefault`; external links `target="_blank" rel="noopener noreferrer"`; code blocks with language label and copy button (`navigator.clipboard.writeText`). **No `{@html}`.**

**Tests:** createChat with a fake fetch: send posts body with `aide.route`, `sessionId`, `dom: null` by default and dom text after a warm-up returned `pageSource:'dom'`; 429 JSON sets `error.code === 'rate_limited'` and calls `onerror`; thread persisted to sessionStorage and restored by a new store; `persistThread:false` writes nothing; CustomEvents dispatched; suggestions resolved by route map. Component smoke test with `svelte/server` `render()` of ChatWidget: contains `data-part="launcher"`, no `<img`. `grep -r "{@html" src/lib` returns nothing (test).

- [ ] Steps: tests → FAIL → implement → PASS → `pnpm check` → commit `feat(headless): chat store and unstyled components`.

---

### Task 16: Plain theme

Spec: §3.9 layer 2, §3.6 CSP (`nonce`), §3.8 positions/modes/responsive.

**Files:** Create `src/lib/themes/plain/{ChatWidget.svelte,ChatWindow.svelte,plain.css,index.ts}`; Test `tests/unit/themes/plain.test.ts`

**Interfaces — Produces:** `ChatWidget`, `ChatWindow` with the headless props plus `nonce?: string`, `position`, `offset`, `mode`. `plain.css` targets `[data-aide-theme="plain"] [data-part=…]`; every colour/radius/font a `--aide-*` custom property; light defaults, dark via `@media (prefers-color-scheme: dark)` and `[data-theme="dark"]`; `@media (prefers-reduced-motion: reduce)` disables transitions; window `max-width: calc(100vw - 16px)`, full-screen under 480 px; wraps at 320 px. Stylesheet delivered by the component injecting a single `<style nonce={nonce}>` into `<svelte:head>` with the CSS imported `?raw` — OR imported as CSS file; choose `?raw` + `<svelte:head><style nonce>` so it works without host CSS handling, and also export `plain.css` for hosts that prefer a link.

**Tests:** server render contains `data-aide-theme="plain"`, style tag carries nonce when given; CSS contains `prefers-color-scheme: dark`, `prefers-reduced-motion`, only `--aide-` custom properties are declared.

- [ ] Steps: tests → FAIL → implement → PASS → commit `feat(themes): plain theme`.

---

### Task 17: shadcn theme and root export

Spec: §3.9 layer 3; acceptance #1 (no `@source`).

**Files:** Create `src/lib/themes/shadcn/ui/**` via CLI, `src/lib/themes/shadcn/{ChatWidget.svelte,ChatWindow.svelte,ChatLauncher.svelte,styles.src.css,index.ts}`, `src/lib/themes/shadcn/utils.ts` (`cn`); Modify `scripts/build-css.mjs`, `src/lib/index.ts`; Test `tests/unit/themes/shadcn.test.ts`

Steps:
- [ ] Generate components: in a scratch SvelteKit app (`pnpm dlx sv create` minimal + `pnpm dlx shadcn-svelte@1.7.0 init` + `add button textarea scroll-area sheet tooltip`), copy `src/lib/components/ui/{button,textarea,scroll-area,sheet,tooltip}` into `themes/shadcn/ui/`, fix imports of `$lib/utils` to `../utils.js`. Rewrite every Tailwind class in `ui/` and theme components to the `aide:` prefix (`aide:flex`, `aide:hover:bg-…` → Tailwind 4 prefix form is `aide:hover:bg-…`).
- [ ] `styles.src.css`: `@import "tailwindcss" prefix(aide);` + `@source "./";` + `@theme inline` mapping `--color-background: var(--background, <fallback>)` etc. for background, foreground, card, card-foreground, popover, primary, primary-foreground, secondary, muted, muted-foreground, accent, border, input, ring, destructive, radius — fallbacks = shadcn-svelte's default neutral oklch palette; dark fallbacks under `@media (prefers-color-scheme: dark)` and `.dark` on an ancestor, applied only when the host variable is absent (fallback values live in `--aide-fallback-*` properties that switch with the scheme). Disable preflight (import only `tailwindcss/theme` and `tailwindcss/utilities` layers with prefix) so host styles are not reset.
- [ ] `build-css.mjs`: runs `@tailwindcss/cli` (`npx @tailwindcss/cli -i src/lib/themes/shadcn/styles.src.css -o src/lib/themes/shadcn/styles.css --minify`); `styles.css` is committed-ignored? No — generated before `svelte-package` and git-ignored; components `import './styles.css'`.
- [ ] Theme `ChatWidget` wraps headless structure with shadcn Button (launcher, send, stop), Textarea (composer), ScrollArea (transcript), Sheet (`mode="sheet"`), Tooltip on launcher; positions (`bottom-right` default …) + `offset`; `mode` floating/inline/sheet; `data-aide-theme="shadcn"`.
- [ ] `src/lib/index.ts`: `export * from './themes/shadcn/index.js';`
- [ ] **Tests:** after `pnpm build`, `dist/themes/shadcn/styles.css` exists, contains `var(--primary`, contains no unprefixed utility like `.flex{` (regex `/\.flex\{/` absent, `/\.aide\\:flex/` present), no preflight (`*,::before` reset absent); server render has `data-aide-theme="shadcn"` and no `<img`.
- [ ] Commit `feat(themes): shadcn theme with precompiled prefixed styles`.

---

## Phase E — Demo, browser tests, docs (L7)

### Task 18: Demo app and Playwright suite

Spec: §9 Browser, acceptance #1, #2, #9, #10 (network part), #14, #15.

**Files:** Create `apps/demo/**` (SvelteKit + adapter-node + Tailwind 4 + shadcn-svelte init + mode-watcher), `apps/demo/src/hooks.server.ts`, `apps/demo/src/lib/mock-model.ts`, routes: `/` (home), `/docs/intro`, `/docs/install`, `/privacy`, `/pricing`, `/late` (thin server HTML, text filled by `onMount` → DOM path), `/logout`, `/themes/plain`, `/themes/headless`, `/themes/shadcn` (each mounts one theme via a `?theme=` layout switch), `/echo-headers` (page echoing request headers for the cookie test); `apps/demo/playwright.config.ts`; `apps/demo/tests/*.spec.ts`; `fixtures/no-shadcn/` (a second minimal SvelteKit app without shadcn using the widget) run as a second Playwright project.

`hooks.server.ts`:
```ts
import { aide, fromEnv } from 'svelte-chat-aide/server';
import { env } from '$env/dynamic/private';
import { mockModel } from '$lib/mock-model';
export const handle = aide({
  provider: env.AIDE_MOCK ? { name: 'custom', model: 'mock', instance: mockModel() } : fromEnv(env),
  origin: env.ORIGIN,
});
```
`mock-model.ts`: `MockLanguageModelV4` whose `doStream` answers with markdown that echoes the last user message and, for the prompt `"hostile"`, returns the hostile corpus (images, raw HTML, `javascript:` link, external link); for `"what does /docs/install say"` calls `read_page` once then answers with a sentence containing a phrase from that page (acceptance #15).

Specs (every one runs per theme `plain | headless | shadcn` where UI is involved):
- a11y: Tab to launcher, Enter opens, focus inside dialog, Tab cycles within (focus trap), `Escape` closes and focus returns to launcher; transcript has `aria-live="polite"`; after an answer the status node text equals the answer once; at 320 px `document.documentElement.scrollWidth <= 320`; `page.emulateMedia({ reducedMotion: 'reduce' })` → computed `transition-duration` of window is `0s`.
- network audit: record every `request` event; after a hostile answer, all URLs have the demo's origin; no `img` element in the transcript; external link rendered as text.
- thread survives reload (sessionStorage).
- launcher snippet page: custom header button opens the window.
- every position: bounding box corner matches.
- warm-up repeated on client-side navigation: count `GET /api/chat?route=` requests, click an internal link, count +1 with the new route.
- `/late`: ask → server received `dom` (demo exposes `/api/test/last-request` in mock mode, returning whether dom was used and whether the dom text appears in the cache dump) — acceptance #14.
- `/llms.txt`, `/llms-full.txt`, `/docs/intro.md` served (no file exists in `static/`) — acceptance #17 end-to-end.
- shadcn with and without shadcn-svelte: in the demo (shadcn init'd) toggling `.dark` changes the widget background to the host's `--background`; in `fixtures/no-shadcn` the widget renders with fallback colours (non-transparent background) and no `@source` line exists in its CSS.

- [ ] Steps: scaffold demo (`pnpm dlx sv create apps/demo --template minimal --types ts --no-add-ons`, then add tailwind + shadcn-svelte init), add workspace dep `svelte-chat-aide: workspace:*`, write specs → run `pnpm --filter demo test:e2e` (FAIL where widget gaps exist; fix bugs in the library in small commits, reporting each) → PASS → commit `test(demo): demo app and Playwright suite`.

---

### Task 19: Docs, CI, publint, final check

Spec: §3.4/§3.5/§3.6 "the docs say…" items, §4, §4.1, acceptance #12.

**Files:** Create `README.md`, `docs/{getting-started,configuration,providers,security,deployment,theming,llms-txt}.md`, `.github/workflows/ci.yml`, `renovate.json`; Modify package `README.md` (copy of root).

Docs must state (each is a spec "docs say" item): prefix stability caveats (§3.3); crawl cost and knobs (`pages.exclude`, `limits.maxPages`, `cache.ttlSeconds`) and per-instance caches / shared `Store` (§3.4, §3.5); `[data-aide-ignore]` on visitor-written text (§3.4, §3.6); `pages.source` must return only public text (§3.4); budget overshoot by one turn (§3.5); endpoint callable by scripts, bounded by rate limit and `siteTokensPerDay` (§3.6); `clientKey` behind proxies (§3.6); serverless `waitUntil`; every provider row with its install line and credentials; `fromEnv` variable table; the hook's shadow-warning deviation from Task 13; out-of-scope list of this plan.
CI: pnpm setup, Node 24 and 22 matrix, `pnpm install --frozen-lockfile`, `pnpm exec playwright install --with-deps chromium`, `pnpm check`. Renovate: weekly, group all, `ignoreUnstable: true`, `rangeStrategy: bump`, `typescript` allowed `<7` with a comment.

- [ ] Run `pnpm check` from the root; fix what fails; report exact final output.
- [ ] Commit `docs: guides, CI and renovate`.

---

## Self-review (done while writing)

- Spec coverage: §3.1 T1/T13; §3.2 T4; §3.3 T5/T12; §3.4 T8–T11/T13; §3.5 T2/T6; §3.6 T3/T6/T9/T12/T14; §3.7 T7/T12/T15; §3.8 T15–T17; §3.9 T15–T17; §3.10 T15; §4 T1; §4.1 T1/T19; §5 T2; §6 T12/T15; §8 acceptance: 1 T17/T18, 2 T18/T9, 3 T1, 4 T4/T12, 5 T5 (offline), 6 T5/T12, 7 T3/T12, 8 T12, 9 T18, 10 T14/T18, 11 T12, 12 T19, 13 T9, 14 T12/T18, 15 T18, 16 T11, 17 T13/T18, 18 T4, 19 T9/T12, 20 T11/T13, 21 T11, 22 T7/T12, 23 T6, 24 T12, 25 T2, 26 T9, 27 T9/T11, 28 T10/T13.
- Names are consistent across tasks: `acceptRoute`, `acceptHref`, `createTransport`, `createPageCache`, `createReader`, `createSiteMap`, `loadProvider`, `buildPrompt`, `windowHistory`, `createGuards`, `runCallback`, `resolveWaitUntil`, `createChatHandler`, `aide`, `parseAnswer`, `createChat`.

## Execution order

1 → 2 → {3, 4, 5, 6, 7, 8, 10, 14 in parallel} → 9 → 11 → 12 → 13 → 15 → {16, 17 in parallel} → 18 → 19.
