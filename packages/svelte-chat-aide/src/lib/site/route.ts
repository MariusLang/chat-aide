/**
 * The one route rule (spec §3.6). Every route the library touches — `aide.route`, `GET ?route=`,
 * `read_page`'s argument, crawled links, sitemap `<loc>`s, `llms.txt` links and redirect
 * targets — goes through this file and nowhere else.
 *
 * Encoded vs decoded: the route this file returns is the WHATWG-normalized, percent-encoded
 * pathname (`/über` → `/%C3%BCber`), which is what the library fetches and caches under. Every
 * check that decides *what page that is* — excludes, side-effect segments, the extension rule,
 * control characters — runs on the pathname as SvelteKit decodes it for routing
 * (`decodeSveltePathname`), so `/%61pi/x` is `/api/x` and `/feed.%6Ason` is `/feed.json`. A
 * pathname SvelteKit cannot decode (malformed `%`) is refused. `%25` stays literal, as in
 * SvelteKit, so double-encoding (`%252e`) is inert.
 */
import { normalizeOrigin } from '../shared/schemas.js';

/** Sentinel origin used for in-process reads when no origin is configured. */
export const IN_PROCESS_ORIGIN = 'http://aide.internal';

/** Last path segments where a GET may act (spec §3.4). */
export const SIDE_EFFECT_SEGMENTS = ['logout', 'logoff', 'signout', 'sign-out', 'unsubscribe', 'delete', 'remove'];

/**
 * Default excludes as globs. The extension rule (last segment containing `.` followed by 1–8
 * alphanumerics) cannot be expressed as a segment glob and is applied by `isExcluded` alongside.
 */
export const DEFAULT_EXCLUDES: string[] = ['/api/**', ...SIDE_EFFECT_SEGMENTS.map((s) => `/**/${s}`)];

const MAX_ROUTE_LENGTH = 512;
const ENCODED_SEPARATOR = /%(2f|5c|2e)/i;
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR = /[\u0000-\u001f\u007f]/;
const EXTENSION = /\.[a-z0-9]{1,8}$/i;

/**
 * SvelteKit's `decode_pathname` (`@sveltejs/kit/src/utils/url.js`): decodeURI per `%25`-split
 * part. Returns null where SvelteKit would throw.
 */
export function decodeSveltePathname(pathname: string): string | null {
	try {
		return pathname.split('%25').map(decodeURI).join('%25');
	} catch {
		return null;
	}
}

function resolveOrigin(origin: string | undefined): string | null {
	return origin === undefined ? IN_PROCESS_ORIGIN : normalizeOrigin(origin);
}

/** Returns the normalized pathname, or null when refused. Never throws. */
export function normalizeRoute(input: unknown, origin?: string): string | null {
	if (typeof input !== 'string') return null;
	if (input.length > MAX_ROUTE_LENGTH) return null;
	if (!input.startsWith('/') || input.startsWith('//')) return null;
	if (input.includes('\\')) return null;
	if (ENCODED_SEPARATOR.test(input)) return null;
	if (CONTROL_CHAR.test(input)) return null;
	const base = resolveOrigin(origin);
	if (base === null) return null;
	let url: URL;
	try {
		url = new URL(input, base);
	} catch {
		return null;
	}
	if (url.origin !== base) return null;
	const decoded = decodeSveltePathname(url.pathname);
	if (decoded === null || CONTROL_CHAR.test(decoded) || decoded.includes('\\')) return null;
	return url.pathname;
}

/** Split a pathname into segments, ignoring the leading `/` and one trailing `/`. */
function segments(path: string): string[] {
	const parts = path.split('/');
	if (parts[0] === '') parts.shift();
	if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
	return parts;
}

function segmentMatches(segment: string, pattern: string): boolean {
	if (!pattern.includes('*')) return segment === pattern;
	const source = pattern
		.split('*')
		.map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
		.join('[^/]*');
	return new RegExp(`^${source}$`).test(segment);
}

function matchSegments(path: string[], pi: number, pattern: string[], qi: number): boolean {
	if (qi === pattern.length) return pi === path.length;
	const head = pattern[qi] as string;
	if (head === '**') {
		for (let k = pi; k <= path.length; k++) if (matchSegments(path, k, pattern, qi + 1)) return true;
		return false;
	}
	if (pi === path.length) return false;
	return segmentMatches(path[pi] as string, head) && matchSegments(path, pi + 1, pattern, qi + 1);
}

/** Glob: `*` one segment, `**` any depth, exact otherwise. Matches the strings as given. */
export function matchesPattern(pathname: string, pattern: string): boolean {
	return matchSegments(segments(pathname), 0, segments(pattern), 0);
}

/**
 * User excludes + defaults (including the extension rule), matched against the SvelteKit-decoded
 * pathname; an undecodable pathname counts as excluded. A pattern written percent-encoded is
 * decoded the same way, so `/über/**` and `/%C3%BCber/**` are equivalent.
 */
export function isExcluded(pathname: string, exclude: string[]): boolean {
	const decoded = decodeSveltePathname(pathname);
	if (decoded === null) return true;
	const parts = segments(decoded);
	const last = parts[parts.length - 1] ?? '';
	if (EXTENSION.test(last)) return true;
	for (const pattern of DEFAULT_EXCLUDES) if (matchesPattern(decoded, pattern)) return true;
	for (const pattern of exclude) {
		if (matchesPattern(decoded, pattern)) return true;
		const decodedPattern = decodeSveltePathname(pattern);
		if (decodedPattern !== null && decodedPattern !== pattern && matchesPattern(decoded, decodedPattern)) return true;
	}
	return false;
}

/** normalizeRoute + !isExcluded */
export function acceptRoute(input: unknown, opts: { origin?: string; exclude: string[] }): string | null {
	const pathname = normalizeRoute(input, opts.origin);
	if (pathname === null) return null;
	return isExcluded(pathname, opts.exclude) ? null : pathname;
}

/**
 * For absolute hrefs from crawled pages / sitemap <loc> / llms.txt / Location headers: resolves
 * against base, requires same origin, returns acceptRoute(pathname).
 */
export function acceptHref(href: string, opts: { origin?: string; base: string; exclude: string[] }): string | null {
	if (typeof href !== 'string') return null;
	const expected = resolveOrigin(opts.origin);
	if (expected === null) return null;
	let url: URL;
	try {
		url = new URL(href, opts.base);
	} catch {
		return null;
	}
	if (url.origin !== expected) return null;
	return acceptRoute(url.pathname, { origin: opts.origin, exclude: opts.exclude });
}
