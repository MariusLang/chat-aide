/**
 * `@chat-aide/next`: the chat endpoint and `llms.txt` as Next.js App Router route handlers.
 *
 * ```ts
 * // lib/aide.ts
 * import { createAide, fromEnv } from '@chat-aide/next';
 * export const aide = createAide(() => ({ provider: fromEnv(process.env), origin: process.env.SITE_ORIGIN }));
 *
 * // app/api/chat/route.ts
 * export const { GET, POST } = aide.chat;
 *
 * // app/llms.txt/route.ts
 * export const { GET } = aide.llmsTxt;
 * ```
 *
 * Pass the config as a function to create the handler on the first request: `next build`
 * evaluates route modules without the run-time environment, where `fromEnv` would throw.
 *
 * The site is read over the network from `origin` (Next.js has no hook to pass the library's own
 * reads through in process), so `origin` is required. Background work — the crawl, cache
 * refreshes and callbacks — is handed to Next.js's `after()` unless `config.waitUntil` is set.
 */
import { createAide as createCoreAide, type Aide, type AideConfig, type ChatHandler, type WebContext } from '@chat-aide/core';
import * as nextServer from 'next/server.js';

export type { AideConfig, ChatHandler, WebContext } from '@chat-aide/core';
export { fromEnv, memoryStore, defaultSystemPrompt } from '@chat-aide/core';

type RouteHandler = (request: Request) => Promise<Response>;

export interface NextAide {
	/** The chat handler behind every route (site map, cache, and `ready` for a smoke test). Created on first use. */
	readonly handler: ChatHandler;
	/** `app/api/chat/route.ts` (or your `config.endpoint`): `export const { GET, POST } = aide.chat`. */
	chat: { GET: RouteHandler; POST: RouteHandler };
	/** `app/llms.txt/route.ts`: `export const { GET, HEAD } = aide.llmsTxt`. */
	llmsTxt: { GET: RouteHandler; HEAD: RouteHandler };
	/** `app/llms-full.txt/route.ts`: `export const { GET, HEAD } = aide.llmsFullTxt`. */
	llmsFullTxt: { GET: RouteHandler; HEAD: RouteHandler };
	/** The framework-neutral handlers, for anything the routes above do not cover. Created on first use. */
	readonly web: Aide;
}

export interface NextAideOptions {
	/**
	 * The visitor's address for the rate limit and budgets. Default: `x-real-ip`, else the last
	 * `x-forwarded-for` entry, which Vercel and most proxies set. Self-hosted without a proxy,
	 * those headers are the client's to forge: pass your own, or set `config.clientKey`.
	 */
	clientAddress?: WebContext['clientAddress'];
}

/** Hands a promise to Next.js's `after()`; outside a request scope it simply runs on. */
function nextWaitUntil(promise: Promise<unknown>): void {
	try {
		nextServer.after(() => promise);
	} catch {
		// Not inside a request (a background refresh started elsewhere): the promise still runs.
	}
}

export function createAide(config: AideConfig | (() => AideConfig), options: NextAideOptions = {}): NextAide {
	let instance: Aide | undefined;
	const web = (): Aide => {
		if (!instance) {
			const resolved = typeof config === 'function' ? config() : config;
			instance = createCoreAide({ ...resolved, waitUntil: resolved.waitUntil ?? nextWaitUntil });
		}
		return instance;
	};
	// A config object is validated now, so a mistake fails at start-up; a factory waits for a request.
	if (typeof config !== 'function') web();

	const ctx: WebContext = { clientAddress: options.clientAddress };
	const bind =
		(pick: (aide: Aide) => Aide['chat']): RouteHandler =>
		(request) =>
			pick(web())(request, ctx);
	const chat = bind((a) => a.chat);
	const txt = bind((a) => a.llmsTxt);
	const full = bind((a) => a.llmsFullTxt);
	return {
		get handler() {
			return web().handler;
		},
		get web() {
			return web();
		},
		chat: { GET: chat, POST: chat },
		llmsTxt: { GET: txt, HEAD: txt },
		llmsFullTxt: { GET: full, HEAD: full }
	};
}
