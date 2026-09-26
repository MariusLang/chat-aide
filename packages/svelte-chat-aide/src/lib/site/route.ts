/**
 * The one route rule (spec §3.6). Every route the library touches — `aide.route`, `GET ?route=`,
 * `read_page`'s argument, crawled links, sitemap `<loc>`s, `llms.txt` links and redirect
 * targets — goes through this file and nowhere else.
 */
import { normalizeOrigin } from '../shared/schemas';

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

/** Glob: `*` one segment, `**` any depth, exact otherwise. */
export function matchesPattern(pathname: string, pattern: string): boolean {
	return matchSegments(segments(pathname), 0, segments(pattern), 0);
}

/** User excludes + defaults (including the extension rule). */
export function isExcluded(pathname: string, exclude: string[]): boolean {
	const parts = segments(pathname);
	const last = parts[parts.length - 1] ?? '';
	if (EXTENSION.test(last)) return true;
	for (const pattern of DEFAULT_EXCLUDES) if (matchesPattern(pathname, pattern)) return true;
	for (const pattern of exclude) if (matchesPattern(pathname, pattern)) return true;
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
