/**
 * An in-memory fake site for the site-map and handler tests. `fetch` answers from a
 * `path -> page` map, records every call, tracks reads in flight and records a violation
 * whenever a read is not anonymous (missing marker, credentials not omitted, redirects not
 * manual, a cookie or authorization header, any header besides `accept` and the marker).
 * Responses carry the `aide()` hook's served stamp, as the app's in-process answers do.
 */
import { INTERNAL_HEADER, INTERNAL_MARKER, SERVED_HEADER, SERVED_MARKER, type FetchLike } from '../../src/lib/site/transport';

export interface FakePage {
	/** Default 200. */
	status?: number;
	/** Content type; default `text/html; charset=utf-8`. */
	type?: string;
	/** The body, or a function called at request time (to observe state when the read happens). */
	body?: string | (() => string);
	headers?: Record<string, string>;
	/** Extra latency for this page, in ms. */
	delay?: number;
}

export interface FakeCall {
	/** The pathname requested (origin stripped for network reads), query and hash included. */
	path: string;
	/** The URL exactly as handed to fetch. */
	url: string;
	init: RequestInit;
	accept: string;
}

export interface FakeSite {
	fetch: FetchLike;
	calls: FakeCall[];
	/** Every non-anonymous read, described. Tests assert it is empty. */
	violations: string[];
	/** Paths requested with an `accept` that asks for HTML (page renders). */
	htmlReads(): string[];
	/** Paths requested, in order. */
	paths(): string[];
	readonly inFlight: number;
	readonly inFlightMax: number;
	/** Add or replace a page after creation. */
	set(path: string, page: FakePage): void;
}

const NOT_FOUND: FakePage = { status: 404, type: 'text/plain', body: 'Not found' };

export function createFakeSite(
	pages: Record<string, FakePage>,
	opts: { latency?: number; marker?: string } = {}
): FakeSite {
	const table = new Map(Object.entries(pages));
	const calls: FakeCall[] = [];
	const violations: string[] = [];
	const marker = opts.marker ?? INTERNAL_MARKER;
	let inFlight = 0;
	let inFlightMax = 0;

	const fetch: FetchLike = async (input, init = {}) => {
		const url = String(input);
		const parsed = new URL(url, 'http://fake.local');
		const path = parsed.pathname + parsed.search + parsed.hash;
		const headers = new Headers(init.headers);
		const accept = headers.get('accept') ?? '';
		calls.push({ path, url, init, accept });

		if (headers.get(INTERNAL_HEADER) !== marker) violations.push(`${path}: marker missing`);
		if (init.credentials !== 'omit') violations.push(`${path}: credentials not omitted`);
		if (init.redirect !== 'manual') violations.push(`${path}: redirect not manual`);
		for (const [name] of headers) {
			if (name !== 'accept' && name !== INTERNAL_HEADER) violations.push(`${path}: header ${name}`);
		}

		inFlight++;
		inFlightMax = Math.max(inFlightMax, inFlight);
		try {
			const page = table.get(parsed.pathname) ?? NOT_FOUND;
			const wait = (opts.latency ?? 0) + (page.delay ?? 0);
			await new Promise((r) => setTimeout(r, wait));
			const body = typeof page.body === 'function' ? page.body() : (page.body ?? '');
			const status = page.status ?? 200;
			const nullBody = status === 204 || status === 304 || (status >= 300 && status < 400);
			return new Response(nullBody ? null : body, {
				status,
				headers: {
					'content-type': page.type ?? 'text/html; charset=utf-8',
					[SERVED_HEADER]: SERVED_MARKER,
					...page.headers
				}
			});
		} finally {
			inFlight--;
		}
	};

	return {
		fetch,
		calls,
		violations,
		htmlReads: () => calls.filter((c) => /text\/html/.test(c.accept)).map((c) => c.path),
		paths: () => calls.map((c) => c.path),
		get inFlight() {
			return inFlight;
		},
		get inFlightMax() {
			return inFlightMax;
		},
		set(path, page) {
			table.set(path, page);
		}
	};
}

/** A small HTML page. Links are `href` strings or `{ href, rel }`. */
export function htmlPage(p: {
	title: string;
	description?: string;
	body?: string;
	links?: (string | { href: string; rel?: string })[];
}): string {
	const links = (p.links ?? [])
		.map((l) => (typeof l === 'string' ? { href: l } : l))
		.map((l) => `<a href="${l.href}"${l.rel ? ` rel="${l.rel}"` : ''}>${l.href}</a>`)
		.join(' ');
	const meta = p.description ? `<meta name="description" content="${p.description}">` : '';
	return `<!doctype html><html><head><title>${p.title}</title>${meta}</head><body><nav>${links}</nav><main><h1>${p.title}</h1><p>${p.body ?? `Body of ${p.title}.`}</p></main></body></html>`;
}
