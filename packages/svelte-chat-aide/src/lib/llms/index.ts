/**
 * `/llms.txt`, `/llms-full.txt` and `<route>.md`, served from the run-time site map (spec §3.4
 * "llms.txt, read and served"). Each export is a SvelteKit `RequestHandler` bound to a chat
 * handler, for a site that mounts the routes by hand; the `aide()` hook mounts the same ones.
 * Nothing is generated or written: the documents are the map, serialised when asked for.
 *
 * The library's own reads of these paths must reach the app, never these handlers (spec §3.1):
 * a hand-mounted route should pass requests carrying the `x-aide-internal` header on (for
 * example by answering `404`), which the handlers here do.
 */
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import type { ChatHandler } from '../server/handler';
import { resolveWaitUntil, type WaitUntil } from '../server/background';
import {
	renderLlmsFull,
	renderLlmsTxt,
	renderPageMarkdown,
	routeForMarkdownPath,
	type MapPage,
	type ServeOptions
} from '../site/llms';
import { acceptRoute } from '../site/route';
import { INTERNAL_HEADER } from '../site/transport';

const TEXT = 'text/plain; charset=utf-8';
const MARKDOWN = 'text/markdown; charset=utf-8';

function notFound(): Response {
	return new Response('Not found', { status: 404, headers: { 'content-type': TEXT } });
}

function document(handler: ChatHandler, body: string, type: string, head: boolean): Response {
	return new Response(head ? null : body, {
		status: 200,
		headers: { 'content-type': type, 'cache-control': `public, max-age=${handler.config.cache.ttlSeconds}` }
	});
}

function serveOptions(handler: ChatHandler): ServeOptions {
	return { exclude: handler.config.pages.exclude, serveSource: handler.config.llms.serveSource };
}

/** Methods answered; anything else, and the library's own reads, get a `404`. */
function answerable(event: RequestEvent): boolean {
	const method = event.request.method.toUpperCase();
	if (method !== 'GET' && method !== 'HEAD') return false;
	return !event.request.headers.has(INTERNAL_HEADER);
}

/**
 * Every answered request can start the crawl, so it is counted in the visitor's warm-up bucket
 * first (`429 rate_limited` past it, nothing started). The map is started and given its crawl budget. This request's `event.fetch` is lent to the
 * reads only when none is adopted yet (the chat endpoint's is preferred) and only through `aide()`.
 */
async function prepare(handler: ChatHandler, event: RequestEvent): Promise<{ limited: Response } | { waitUntil: WaitUntil }> {
	const limited = await handler.limitWarmup(event);
	if (limited) return { limited };
	handler.adoptFetch(event, true);
	const waitUntil = await resolveWaitUntil(event, handler.config.waitUntil);
	handler.siteMap.ensureStarted(waitUntil);
	await handler.siteMap.waitFor(handler.config.limits.crawlBudgetMs);
	return { waitUntil };
}

export function llmsTxt(handler: ChatHandler): RequestHandler {
	return async (event) => {
		if (!answerable(event)) return notFound();
		const ready = await prepare(handler, event);
		if ('limited' in ready) return ready.limited;
		const body = renderLlmsTxt(handler.siteMap.site(), handler.siteMap.pages(), serveOptions(handler));
		return document(handler, body, TEXT, event.request.method.toUpperCase() === 'HEAD');
	};
}

export function llmsFullTxt(handler: ChatHandler): RequestHandler {
	return async (event) => {
		if (!answerable(event)) return notFound();
		const ready = await prepare(handler, event);
		if ('limited' in ready) return ready.limited;
		const body = renderLlmsFull(handler.siteMap.site(), handler.siteMap.pages(), serveOptions(handler));
		return document(handler, body, MARKDOWN, event.request.method.toUpperCase() === 'HEAD');
	};
}

/** The mapped page for a `.md` pathname, or null: unmapped, excluded, or source-only. */
function lookup(handler: ChatHandler, pathname: string): MapPage | null {
	const { config } = handler;
	const route = acceptRoute(routeForMarkdownPath(pathname), { origin: config.origin, exclude: config.pages.exclude });
	if (route === null) return null;
	const pages = handler.siteMap.pages();
	const find = (r: string) => pages.find((p) => p.route === r);
	// `/a/index.html.md` names `/a/`; a site without trailing slashes maps it as `/a`.
	const page = find(route) ?? (route.length > 1 && route.endsWith('/') ? find(route.slice(0, -1)) : undefined);
	if (!page) return null;
	if (page.fromSource && !config.llms.serveSource) return null;
	return page;
}

export function pageMarkdown(handler: ChatHandler): RequestHandler {
	return async (event) => {
		if (!answerable(event)) return notFound();
		if (routeForMarkdownPath(event.url.pathname) === null) return notFound();
		const ready = await prepare(handler, event);
		if ('limited' in ready) return ready.limited;
		const { waitUntil } = ready;
		let page = lookup(handler, event.url.pathname);
		if (!page) return notFound();
		// A page known only from the site's own llms.txt has no text yet: read it now.
		if (!page.fromSource && !page.text) {
			const entry = await handler.reader.readPage(page.route, { waitUntil });
			if (!entry) return notFound();
			page = { ...page, title: entry.title || page.title, text: entry.text, headings: entry.headings };
			if (entry.description) page.description = entry.description;
		}
		return document(handler, renderPageMarkdown(page), MARKDOWN, event.request.method.toUpperCase() === 'HEAD');
	};
}
