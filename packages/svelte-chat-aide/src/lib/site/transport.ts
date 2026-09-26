/**
 * The one way the library reads the site (spec §3.4 "Reading one page"). Every read is
 * anonymous: `credentials: 'omit'`, a fresh `Headers` holding only `accept`, `accept-language: *`
 * and the internal marker, `redirect: 'manual'`. Redirects are followed only through the route
 * rule. `accept-language` is set because SvelteKit's `event.fetch` copies the visitor's onto a
 * read that has none (`fetch.js`), which would make a cached page depend on who asked first.
 */
import { MAX_REDIRECTS } from '../shared/limits';
import { normalizeOrigin } from '../shared/schemas';
import { IN_PROCESS_ORIGIN, acceptHref, normalizeRoute } from './route';

export const INTERNAL_HEADER = 'x-aide-internal';
/** Random per process; the hook recognises the library's own reads by it (spec §3.1). */
export const INTERNAL_MARKER: string = crypto.randomUUID();

/**
 * The `aide()` hook stamps its answers to the library's in-process sub-requests with this header
 * and a second per-process random value that is never sent on a read, so it cannot leak to a
 * host the read reaches. With no origin configured, an in-process response without the stamp is
 * refused: SvelteKit's `event.fetch` answers some paths (a route not in the manifest, a rerouted
 * prerendered path) with a network fetch against `event.url.origin`, which comes from `Host`,
 * and re-wraps the answer with an empty `url` (`respond.js`).
 */
export const SERVED_HEADER = 'x-aide-served';
export const SERVED_MARKER: string = crypto.randomUUID();

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
	/**
	 * Adopts a request's `event.fetch` for in-process reads. With an origin configured, a fetch
	 * from an event whose `url.origin` differs (a forged `Host`) is refused and `false` returned;
	 * `eventOrigin` omitted means the caller vouches for it.
	 */
	setInProcessFetch(f: FetchLike, eventOrigin?: string): boolean;
	hasInProcessFetch(): boolean;
}

const DEFAULT_ACCEPT = 'text/html';
/** One read, redirects and body included, is abandoned after this long. */
export const READ_TIMEOUT_MS = 10_000;
/** A body larger than this is a `status` miss. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
const ACCEPT_LANGUAGE = '*';

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

/** The body as UTF-8 text, or null when it is larger than `max` bytes (the rest is not read). */
async function readBody(res: Response, max: number, signal: AbortSignal): Promise<string | null> {
	const declared = Number(res.headers.get('content-length'));
	if (declared > max) {
		discard(res);
		return null;
	}
	if (!res.body) return '';
	const reader = res.body.getReader();
	const stop = () => void reader.cancel().catch(() => {});
	signal.addEventListener('abort', stop, { once: true });
	try {
		const chunks: Uint8Array[] = [];
		let size = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > max) {
				stop();
				return null;
			}
			chunks.push(value);
		}
		if (signal.aborted) throw signal.reason;
		const all = new Uint8Array(size);
		let at = 0;
		for (const c of chunks) {
			all.set(c, at);
			at += c.byteLength;
		}
		return new TextDecoder().decode(all);
	} finally {
		signal.removeEventListener('abort', stop);
	}
}

function originOf(url: string): string | null {
	try {
		return new URL(url).origin;
	} catch {
		return null;
	}
}

/**
 * In process: the relative path through the last `event.fetch` handed in. Network fallback
 * (only when an origin is configured, and the in-process fetch is missing or answered `404`,
 * as for a prerendered route served outside the handler): `networkFetch(origin + path)`.
 */
export function createTransport(opts: {
	origin?: string;
	exclude: string[];
	networkFetch?: FetchLike;
	/** Per-read deadline (default `READ_TIMEOUT_MS`). */
	timeoutMs?: number;
	/** Body size cap in bytes (default `MAX_BODY_BYTES`). */
	maxBytes?: number;
}): Transport {
	const origin = opts.origin === undefined ? undefined : (normalizeOrigin(opts.origin) ?? undefined);
	const configured = opts.origin !== undefined;
	const timeoutMs = opts.timeoutMs ?? READ_TIMEOUT_MS;
	const maxBytes = opts.maxBytes ?? MAX_BODY_BYTES;
	let inProcess: FetchLike | undefined;

	/**
	 * An in-process answer is SvelteKit's own (empty `url`) or a network fetch it made (absolute
	 * `url`). The latter is kept only when it came from the configured origin; with no origin,
	 * reads are in process only (spec §3.4), so it is refused, as is an answer the hook did not stamp.
	 */
	function trusted(res: Response): boolean {
		if (res.url) return origin !== undefined && originOf(res.url) === origin;
		if (origin) return true;
		return res.headers.get(SERVED_HEADER) === SERVED_MARKER;
	}

	function init(accept: string, signal: AbortSignal): RequestInit {
		return {
			method: 'GET',
			signal,
			credentials: 'omit',
			redirect: 'manual',
			headers: new Headers({ accept, 'accept-language': ACCEPT_LANGUAGE, [INTERNAL_HEADER]: INTERNAL_MARKER })
		};
	}

	async function fetchOnce(path: string, accept: string, signal: AbortSignal): Promise<Response | null> {
		if (inProcess) {
			let res: Response | null;
			try {
				res = await inProcess(path, init(accept, signal));
			} catch {
				res = null;
			}
			if (res && signal.aborted) {
				discard(res);
				return null;
			}
			if (res && !trusted(res)) {
				discard(res);
				return null;
			}
			if (res && (res.status !== 404 || !origin)) return res;
			if (!origin) return null;
			if (res) discard(res);
		}
		if (!origin) return null;
		const network = opts.networkFetch ?? globalThis.fetch;
		try {
			return await network(origin + path, init(accept, signal));
		} catch {
			return null;
		}
	}

	return {
		setInProcessFetch(f, eventOrigin) {
			if (origin !== undefined && eventOrigin !== undefined && eventOrigin !== origin) return false;
			inProcess = f;
			return true;
		},

		hasInProcessFetch() {
			return inProcess !== undefined;
		},

		async read(path, accept = DEFAULT_ACCEPT) {
			// A configured origin that failed to normalise refuses every read.
			if (configured && !origin) return networkMiss;
			// One deadline per read: a fetch or body that never ends must not hold the caller.
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), timeoutMs);
			const timedOut = new Promise<ReadMiss>((resolve) => {
				controller.signal.addEventListener('abort', () => resolve(networkMiss), { once: true });
			});
			try {
				return await Promise.race([readWithin(path, accept, controller.signal), timedOut]);
			} catch {
				return networkMiss;
			} finally {
				clearTimeout(timer);
				controller.abort();
			}
		}
	};

	async function readWithin(path: string, accept: string, signal: AbortSignal): Promise<ReadResult | ReadMiss> {
		const start = normalizeRoute(path, origin);
		if (start === null) return networkMiss;
		let current: string = start;
		const base = origin ?? IN_PROCESS_ORIGIN;

		for (let hop = 0; ; hop++) {
			const res = await fetchOnce(current, accept, signal);
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

			let body: string | null;
			try {
				body = await readBody(res, maxBytes, signal);
			} catch {
				return networkMiss;
			}
			if (body === null) return { ok: false, status: res.status, reason: 'status' };
			return { ok: true, status: 200, contentType, body, finalRoute: current };
		}
	}
}
