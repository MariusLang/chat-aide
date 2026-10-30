/**
 * The core on web-standard `Request` → `Response`, for every framework that is not SvelteKit
 * (Next.js route handlers, Astro, Remix / React Router, Nuxt via `toWebRequest`, Hono, Bun).
 *
 * These handlers never read the site in process: they have no framework hook to pass the
 * library's own reads through, so every read goes over the network to `config.origin` (the same
 * path a hand-mounted SvelteKit handler takes). `origin` is therefore required here.
 */
import { routeForMarkdownPath } from '../site/llms.js';
import { llmsFullTxt, llmsTxt, pageMarkdown } from '../llms/index.js';
import type { AideConfig, AideEvent } from '../shared/types.js';
import { createChatHandler, type ChatHandler, type ChatHandlerDeps } from './handler.js';
import { warn } from './warn.js';

export interface WebContext {
	/**
	 * The visitor's address, for the per-visitor rate limit and budget. A string, or a function of
	 * the request. By default `x-real-ip`, else the last `x-forwarded-for` entry (the one your
	 * nearest proxy added). Both headers are the client's to forge when no proxy sets them: behind
	 * no proxy, pass the address your server reports, or set `config.clientKey`.
	 */
	clientAddress?: string | ((request: Request) => string);
	/** Platform context, e.g. `{ context: { waitUntil } }` on Cloudflare or Netlify. */
	platform?: unknown;
}

/** The visitor's address from the usual proxy headers, or `''` when there is none. */
export function headerAddress(request: Request): string {
	const real = request.headers.get('x-real-ip')?.trim();
	if (real) return real;
	const forwarded = request.headers.get('x-forwarded-for');
	if (!forwarded) return '';
	const hops = forwarded
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	return hops.at(-1) ?? '';
}

let warnedAddress = false;

/** An `AideEvent` for a plain `Request`. */
export function toAideEvent(request: Request, ctx: WebContext = {}): AideEvent {
	return {
		request,
		url: new URL(request.url),
		fetch: (input, init) => globalThis.fetch(input, init),
		getClientAddress: () => {
			const given = ctx.clientAddress;
			const address = typeof given === 'function' ? given(request) : (given ?? headerAddress(request));
			if (!address && !warnedAddress) {
				warnedAddress = true;
				warn(
					'no client address for this request (no x-real-ip or x-forwarded-for header, no clientAddress): ' +
						'every such visitor shares one rate-limit bucket. Pass clientAddress, or set config.clientKey.'
				);
			}
			return address;
		},
		platform: ctx.platform,
		isSubRequest: false
	};
}

export type WebHandler = (request: Request, ctx?: WebContext) => Promise<Response>;

export interface Aide {
	/** The chat handler behind every route (its site map, cache and `ready` promise). */
	handler: ChatHandler;
	/** The chat endpoint: `GET` warm-up, `POST` turn. Mount at `config.endpoint` (default `/api/chat`). */
	chat: WebHandler;
	/** `/llms.txt` from the site map. */
	llmsTxt: WebHandler;
	/** `/llms-full.txt` from the site map. */
	llmsFullTxt: WebHandler;
	/** `<route>.md`: the markdown of one mapped page, by the request's pathname. */
	pageMarkdown: WebHandler;
	/**
	 * All four by pathname: the endpoint, `/llms.txt`, `/llms-full.txt` and `*.md`; `404` for
	 * anything else. For servers that route everything through one function (Hono, Bun).
	 */
	fetch: WebHandler;
}

/**
 * Creates the chat and llms handlers for a web-standard framework.
 *
 * ```ts
 * const aide = createAide({ provider, origin: 'https://example.com' });
 * export const GET = aide.chat;   // app/api/chat/route.ts (Next.js)
 * export const POST = aide.chat;
 * ```
 */
export function createAide(config: AideConfig, deps?: ChatHandlerDeps): Aide {
	if (!config.origin) {
		throw new Error(
			'chat-aide: config.origin is required outside SvelteKit (the site is read over the network from it), ' +
				"e.g. origin: 'https://example.com', or 'http://localhost:3000' in development."
		);
	}
	const handler = createChatHandler(config, deps);
	const txt = llmsTxt(handler);
	const full = llmsFullTxt(handler);
	const md = pageMarkdown(handler);
	const wrap =
		(fn: (event: AideEvent) => Promise<Response>): WebHandler =>
		(request, ctx) =>
			fn(toAideEvent(request, ctx));

	const chat = wrap(handler);
	const llms = wrap(txt);
	const llmsFull = wrap(full);
	const markdown = wrap(md);
	return {
		handler,
		chat,
		llmsTxt: llms,
		llmsFullTxt: llmsFull,
		pageMarkdown: markdown,
		fetch: (request, ctx) => {
			const { pathname } = new URL(request.url);
			if (pathname === handler.config.endpoint) return chat(request, ctx);
			if (!handler.config.llms.serve) return Promise.resolve(new Response('Not found', { status: 404 }));
			if (pathname === '/llms.txt') return llms(request, ctx);
			if (pathname === '/llms-full.txt') return llmsFull(request, ctx);
			if (routeForMarkdownPath(pathname) !== null) return markdown(request, ctx);
			return Promise.resolve(new Response('Not found', { status: 404 }));
		}
	};
}
