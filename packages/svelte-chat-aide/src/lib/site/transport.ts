/**
 * The one way the library reads the site (spec §3.4 "Reading one page"). Every read is
 * anonymous: `credentials: 'omit'`, a fresh `Headers` holding only `accept` and the internal
 * marker, `redirect: 'manual'`. Redirects are followed only through the route rule.
 */
import { MAX_REDIRECTS } from '../shared/limits';
import { normalizeOrigin } from '../shared/schemas';
import { IN_PROCESS_ORIGIN, acceptHref, normalizeRoute } from './route';

export const INTERNAL_HEADER = 'x-aide-internal';
/** Random per process; the hook recognises the library's own reads by it (spec §3.1). */
export const INTERNAL_MARKER: string = crypto.randomUUID();

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface ReadResult {
	ok: true;
	status: 200;
	contentType: 'html' | 'markdown' | 'text' | 'xml';
	body: string;
	finalRoute: string;
}

export interface ReadMiss {
	ok: false;
	status: number;
	reason: 'status' | 'redirect' | 'content-type' | 'network';
}

export interface Transport {
	read(path: string, accept?: string): Promise<ReadResult | ReadMiss>;
	setInProcessFetch(f: FetchLike): void;
}

const DEFAULT_ACCEPT = 'text/html';

const CONTENT_TYPES: Record<string, ReadResult['contentType']> = {
	'text/html': 'html',
	'text/markdown': 'markdown',
	'text/x-markdown': 'markdown',
	'text/plain': 'text'
};

const XML_TYPES = new Set(['application/xml', 'text/xml']);

/** XML (a sitemap) is accepted only when the caller's `accept` asks for it. */
function contentTypeOf(res: Response, accept: string): ReadResult['contentType'] | null {
	const raw = res.headers.get('content-type');
	if (!raw) return null;
	const mime = raw.split(';')[0]!.trim().toLowerCase();
	if (XML_TYPES.has(mime)) return /xml/i.test(accept) ? 'xml' : null;
	return CONTENT_TYPES[mime] ?? null;
}

function discard(res: Response): void {
	res.body?.cancel().catch(() => {});
}

const networkMiss: ReadMiss = { ok: false, status: 0, reason: 'network' };

/**
 * In process: the relative path through the last `event.fetch` handed in. Network fallback
 * (only when an origin is configured, and the in-process fetch is missing or answered `404`,
 * as for a prerendered route served outside the handler): `networkFetch(origin + path)`.
 */
export function createTransport(opts: { origin?: string; exclude: string[]; networkFetch?: FetchLike }): Transport {
	const origin = opts.origin === undefined ? undefined : (normalizeOrigin(opts.origin) ?? undefined);
	const configured = opts.origin !== undefined;
	let inProcess: FetchLike | undefined;

	function init(accept: string): RequestInit {
		return {
			method: 'GET',
			credentials: 'omit',
			redirect: 'manual',
			headers: new Headers({ accept, [INTERNAL_HEADER]: INTERNAL_MARKER })
		};
	}

	async function fetchOnce(path: string, accept: string): Promise<Response | null> {
		if (inProcess) {
			let res: Response | null;
			try {
				res = await inProcess(path, init(accept));
			} catch {
				res = null;
			}
			if (res && (res.status !== 404 || !origin)) return res;
			if (!origin) return null;
			if (res) discard(res);
		}
		if (!origin) return null;
		const network = opts.networkFetch ?? globalThis.fetch;
		try {
			return await network(origin + path, init(accept));
		} catch {
			return null;
		}
	}

	return {
		setInProcessFetch(f) {
			inProcess = f;
		},

		async read(path, accept = DEFAULT_ACCEPT) {
			// A configured origin that failed to normalise refuses every read.
			if (configured && !origin) return networkMiss;
			const start = normalizeRoute(path, origin);
			if (start === null) return networkMiss;
			let current: string = start;
			const base = origin ?? IN_PROCESS_ORIGIN;

			for (let hop = 0; ; hop++) {
				const res = await fetchOnce(current, accept);
				if (!res) return networkMiss;

				if (res.status >= 300 && res.status < 400) {
					discard(res);
					const location = res.headers.get('location');
					const next: string | null =
						location === null || hop >= MAX_REDIRECTS
							? null
							: acceptHref(location, { origin, base: base + current, exclude: opts.exclude });
					if (next === null) return { ok: false, status: res.status, reason: 'redirect' };
					current = next;
					continue;
				}

				if (res.status !== 200) {
					discard(res);
					return { ok: false, status: res.status, reason: 'status' };
				}

				const contentType = contentTypeOf(res, accept);
				if (!contentType) {
					discard(res);
					return { ok: false, status: res.status, reason: 'content-type' };
				}

				let body: string;
				try {
					body = await res.text();
				} catch {
					return networkMiss;
				}
				return { ok: true, status: 200, contentType, body, finalRoute: current };
			}
		}
	};
}
