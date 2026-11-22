/**
 * What a page says to robots (`pages.respectNoindex`): its `<meta name="robots">` tags and the
 * `X-Robots-Tag` header of its response. `noindex` keeps the page out of everything the library
 * derives from it; `nofollow` keeps its links out of the crawl; `none` is both.
 *
 * Only directives for every robot count. A meta tag named after one crawler (`googlebot`) is
 * skipped, and so is a header directive with a user agent written in front of it
 * (`googlebot: noindex`).
 */

export interface Robots {
	noindex: boolean;
	nofollow: boolean;
}

/**
 * A directive list, as a robots meta `content` or an `X-Robots-Tag` value: comma-separated, in
 * any letter case. A part holding a `:` is a directive for one user agent or one with a value
 * (`max-snippet: 20`) and is skipped whole. Repeated header lines reach the library joined by
 * commas, so a user agent can only be taken to cover the directive it is written on: in
 * `googlebot: noindex, nofollow` the `nofollow` counts for everyone. That errs towards
 * hiding, and never drops a `noindex` sent on a line of its own.
 */
export function parseRobots(value: string | null | undefined): Robots {
	const out: Robots = { noindex: false, nofollow: false };
	for (const part of String(value ?? '').toLowerCase().split(',')) {
		if (part.includes(':')) continue;
		for (const word of part.split(/\s+/)) {
			if (word === 'noindex' || word === 'none') out.noindex = true;
			if (word === 'nofollow' || word === 'none') out.nofollow = true;
		}
	}
	return out;
}

/** An attribute by name in any letter case: linkedom keeps `CONTENT="…"` as written. */
function attribute(el: Element, name: string): string {
	const exact = el.getAttribute(name);
	if (exact !== null) return exact;
	for (const a of Array.from(el.attributes)) if (a.name.toLowerCase() === name) return a.value;
	return '';
}

/**
 * The directives of a parsed page and its `X-Robots-Tag` header, merged: any `noindex` wins.
 * Every `meta` element named `robots` counts, wherever it stands; text that only looks like one
 * (a comment, a script, a code sample) is not an element and does not.
 */
export function pageRobots(doc: Document, header?: string | null): Robots {
	const out = parseRobots(header);
	for (const meta of Array.from(doc.querySelectorAll('meta'))) {
		if (attribute(meta, 'name').trim().toLowerCase() !== 'robots') continue;
		const { noindex, nofollow } = parseRobots(attribute(meta, 'content'));
		out.noindex ||= noindex;
		out.nofollow ||= nofollow;
	}
	return out;
}
