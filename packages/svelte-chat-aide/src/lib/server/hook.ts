/**
 * `aide(config)`: the one-line SvelteKit `Handle` (spec §3.1). It answers four paths — the chat
 * endpoint, `/llms.txt`, `/llms-full.txt` and `<route>.md` — and passes everything else to
 * `resolve`. For those four it calls `resolve` first and answers only on a `404`, so it never
 * shadows a route the app answers itself. Requests carrying the library's internal marker are
 * its own reads of the site and go straight to `resolve`, so the hook never answers itself.
 *
 * Deviation from the spec: the "app has a route at `endpoint`" warning cannot be given at
 * creation (a hook has no access to the app's manifest), so it is given once, at the first
 * request to the endpoint that the app answers with anything but a `404`.
 */
import type { Handle, RequestHandler } from '@sveltejs/kit';
import type { AideConfig } from '../shared/types';
import { routeForMarkdownPath } from '../site/llms';
import { INTERNAL_HEADER, INTERNAL_MARKER } from '../site/transport';
import { llmsFullTxt, llmsTxt, pageMarkdown } from '../llms/index';
import { createChatHandler, type ChatHandler, type ChatHandlerDeps } from './handler';
import { warn } from './warn';

export type AideHandle = Handle & { handler: ChatHandler };

type Kind = 'endpoint' | 'llms' | 'llms-full' | 'markdown';

export function aide(config: AideConfig, deps?: ChatHandlerDeps): AideHandle {
	const handler = createChatHandler(config, deps);
	const { endpoint, llms } = handler.config;
	const answer: Record<Exclude<Kind, 'endpoint'>, RequestHandler> = {
		llms: llmsTxt(handler),
		'llms-full': llmsFullTxt(handler),
		markdown: pageMarkdown(handler)
	};
	let warnedShadow = false;

	function kindOf(pathname: string): Kind | null {
		if (pathname === endpoint) return 'endpoint';
		if (pathname === '/llms.txt') return 'llms';
		if (pathname === '/llms-full.txt') return 'llms-full';
		if (routeForMarkdownPath(pathname) !== null) return 'markdown';
		return null;
	}

	const handle = (async ({ event, resolve }) => {
		if (event.request.headers.get(INTERNAL_HEADER) === INTERNAL_MARKER) return resolve(event);
		const kind = kindOf(event.url.pathname);
		if (kind === null || (kind !== 'endpoint' && !llms.serve)) return resolve(event);

		const res = await resolve(event);
		if (res.status !== 404) {
			if (kind === 'endpoint' && !warnedShadow) {
				warnedShadow = true;
				warn(
					`the app answers ${endpoint} itself, so the chat handler is not mounted there. ` +
						'Set config.endpoint to a free path, or remove the route.'
				);
			}
			return res;
		}
		res.body?.cancel().catch(() => {});

		if (kind === 'endpoint') return handler(event);
		return answer[kind](event as Parameters<RequestHandler>[0]);
	}) as AideHandle;

	handle.handler = handler;
	return handle;
}
