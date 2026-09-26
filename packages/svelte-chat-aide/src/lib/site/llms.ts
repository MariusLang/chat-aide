/**
 * llms.txt in both directions (spec §3.3 point 4, §3.4 "llms.txt, read and served").
 * Grammar: https://llmstxt.org — H1 title, optional `>` summary, optional detail
 * paragraphs, `##` sections of `- [title](url): description`; `## Optional` is skippable.
 * Pure string functions: no I/O, never throw.
 */
import type { Heading } from '../shared/types';
import { isExcluded } from './route.js';

export interface LlmsLink {
	title: string;
	url: string;
	description?: string;
	optional: boolean;
	section: string;
}
export interface LlmsDoc {
	title: string;
	summary?: string;
	details?: string;
	links: LlmsLink[];
}
export interface MapPage {
	route: string;
	title: string;
	description?: string;
	headings: Heading[];
	text: string;
	fromSource: boolean;
}
export interface SiteInfo {
	title: string;
	summary?: string;
}
export interface ServeOptions {
	exclude: string[];
	serveSource: boolean;
}

const CUT_MARK = '(outline cut)';
const ROOT_SECTION = 'Pages';
const LINK_RE = /^\s*[-*+]\s+\[((?:\\.|[^\]\\])*)\]\((.+?)\)(?:\s*:\s*(.*?))?\s*$/;
const FENCE_RE = /^\s*(```|~~~)/;
const SOURCE_RE = /^(?:source|url):\s*(\S+)\s*$/i;

// ---------------------------------------------------------------- parsing

export function parseLlmsTxt(text: string): LlmsDoc {
	const lines = String(text ?? '')
		.replace(/\r\n?/g, '\n')
		.split('\n');
	let title = '';
	let section: string | null = null;
	const summary: string[] = [];
	const details: string[] = [];
	const links: LlmsLink[] = [];

	for (const line of lines) {
		const h2 = /^##\s+(.*?)\s*#*\s*$/.exec(line);
		if (h2) {
			section = h2[1] ?? '';
			continue;
		}
		if (section !== null) {
			const m = LINK_RE.exec(line);
			if (!m) continue;
			const link: LlmsLink = {
				title: (m[1] ?? '').replace(/\\([\\[\]])/g, '$1').trim(),
				url: (m[2] ?? '').trim(),
				optional: section.trim().toLowerCase() === 'optional',
				section
			};
			const description = m[3]?.trim();
			if (description) link.description = description;
			links.push(link);
			continue;
		}
		if (!title) {
			const h1 = /^#\s+(.*?)\s*$/.exec(line);
			if (h1) title = h1[1] ?? '';
			continue;
		}
		const quote = /^>\s?(.*)$/.exec(line);
		if (quote && details.length === 0) {
			summary.push((quote[1] ?? '').trim());
			continue;
		}
		if (details.length === 0 && line.trim() === '') continue;
		details.push(line);
	}

	const doc: LlmsDoc = { title, links };
	const s = summary.join(' ').trim();
	if (s) doc.summary = s;
	const d = details.join('\n').trim();
	if (d) doc.details = d;
	return doc;
}

export function splitLlmsFull(
	text: string,
	knownRoutes?: string[]
): { route?: string; title: string; text: string }[] {
	const lines = String(text ?? '')
		.replace(/\r\n?/g, '\n')
		.split('\n');
	const chunks: { title: string; body: string[] }[] = [];
	let inFence = false;
	for (const line of lines) {
		if (FENCE_RE.test(line)) inFence = !inFence;
		const h1 = inFence ? null : /^#\s+(.*?)\s*$/.exec(line);
		if (h1) chunks.push({ title: h1[1] ?? '', body: [] });
		else chunks.at(-1)?.body.push(line);
	}

	const bySlug = new Map<string, string | null>();
	for (const route of knownRoutes ?? []) {
		const last = route.split('/').filter(Boolean).at(-1);
		if (!last) continue;
		const key = slug(last);
		bySlug.set(key, bySlug.has(key) ? null : route); // ambiguous → null
	}

	return chunks.map(({ title, body }) => {
		let route: string | undefined;
		const first = body.findIndex((l) => l.trim() !== '');
		const src = first >= 0 ? SOURCE_RE.exec(body[first]!.trim()) : null;
		if (src) {
			route = src[1];
			body.splice(first, 1);
		} else {
			route = bySlug.get(slug(title)) ?? undefined;
		}
		const part: { route?: string; title: string; text: string } = { title, text: body.join('\n').trim() };
		if (route) part.route = route;
		return part;
	});
}

// ---------------------------------------------------------------- rendering

export function renderLlmsTxt(site: SiteInfo, pages: MapPage[], opts: ServeOptions): string {
	return assemble(siteHeader(site), served(pages, opts).map(pageItem));
}

export function renderLlmsFull(site: SiteInfo, pages: MapPage[], opts: ServeOptions): string {
	const parts = [siteHeader(site)];
	for (const p of served(pages, opts)) {
		let block = `# ${oneLine(p.title)}\nSource: ${p.route}`;
		if (p.description) block += `\n\n> ${oneLine(p.description)}`;
		const body = demoteH1(p.text.trim());
		if (body) block += `\n\n${body}`;
		parts.push(block);
	}
	return parts.join('\n\n') + '\n';
}

export function renderPageMarkdown(page: MapPage): string {
	let out = `# ${oneLine(page.title)}\n\n`;
	if (page.description) out += `> ${oneLine(page.description)}\n\n`;
	return out + page.text.trim() + '\n';
}

export function markdownPathFor(route: string): string {
	return route.endsWith('/') ? `${route}index.html.md` : `${route}.md`;
}

export function routeForMarkdownPath(path: string): string | null {
	if (typeof path !== 'string' || !path.startsWith('/') || !path.endsWith('.md')) return null;
	if (path.endsWith('/index.html.md')) return path.slice(0, -'index.html.md'.length);
	const route = path.slice(0, -'.md'.length);
	if (route === '' || route.endsWith('/')) return null;
	return route;
}

/**
 * The outline for the prompt: the llms.txt rendering of the map (or the site's own
 * llms.txt, verbatim, as `base`), with page headings beneath links while `maxChars`
 * allows. Over `maxChars` it is cut at the last whole link line, `## Optional` first.
 */
export function outlineFrom(
	site: SiteInfo,
	pages: MapPage[],
	opts: { maxChars: number; withHeadings: boolean },
	base?: LlmsDoc
): { text: string; cut: boolean } {
	let header: string;
	let items: Item[];
	if (base) {
		header = siteHeader({ title: base.title, summary: base.summary });
		if (base.details) header += `\n\n${base.details}`;
		items = base.links.map((l) => ({
			section: l.section,
			optional: l.optional,
			line: linkLine(l.title, l.url, l.description),
			sub: []
		}));
	} else {
		header = siteHeader(site);
		items = pages.map(pageItem);
	}

	const max = Math.max(0, Math.floor(opts.maxChars));
	let text = assemble(header, items);
	if (text.length <= max) {
		if (!base && opts.withHeadings) {
			let length = text.length;
			pages.forEach((p, i) => {
				const sub = headingLines(p);
				const add = sub.reduce((n, s) => n + s.length + 1, 0);
				if (sub.length && length + add <= max) {
					items[i]!.sub = sub;
					length += add;
				}
			});
			text = assemble(header, items);
		}
		return { text, cut: false };
	}

	// Cut: keep all non-optional items and the longest prefix of optional ones that fits;
	// failing that, the longest prefix of non-optional items.
	const budget = max - CUT_MARK.length;
	const nonOpt = items.filter((i) => !i.optional);
	const opt = items.filter((i) => i.optional);
	const render = (k: number, m: number) => {
		const keep = new Set([...nonOpt.slice(0, k), ...opt.slice(0, m)]);
		return assemble(header, items.filter((i) => keep.has(i)));
	};
	let best = longestFit(opt.length, (m) => render(nonOpt.length, m), budget);
	if (best === null) best = longestFit(nonOpt.length, (k) => render(k, 0), budget);
	if (best === null) {
		const h = header.slice(0, Math.max(0, budget - 1));
		const nl = h.lastIndexOf('\n');
		best = (nl > 0 ? h.slice(0, nl) : h).trimEnd() + '\n';
	}
	return { text: (best + CUT_MARK).slice(0, Math.max(max, CUT_MARK.length)), cut: true };
}

// ---------------------------------------------------------------- helpers

interface Item {
	section: string;
	optional: boolean;
	line: string;
	sub: string[];
}

/** Largest n in [0, count] whose render fits; returns that render, or null if even 0 does not. */
function longestFit(count: number, render: (n: number) => string, budget: number): string | null {
	let lo = 0;
	let hi = count;
	let best: string | null = null;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const t = render(mid);
		if (t.length <= budget) {
			best = t;
			lo = mid + 1;
		} else hi = mid - 1;
	}
	return best;
}

function assemble(header: string, items: Item[]): string {
	const sections = new Map<string, string[]>();
	for (const item of items) {
		let lines = sections.get(item.section);
		if (!lines) sections.set(item.section, (lines = []));
		lines.push(item.line, ...item.sub);
	}
	let out = header;
	for (const [name, lines] of sections) out += `\n\n## ${name}\n\n${lines.join('\n')}`;
	return out + '\n';
}

function siteHeader(site: SiteInfo): string {
	let h = `# ${oneLine(site.title)}`;
	const summary = site.summary ? oneLine(site.summary) : '';
	if (summary) h += `\n\n> ${summary}`;
	return h;
}

function served(pages: MapPage[], opts: ServeOptions): MapPage[] {
	return pages.filter((p) => (opts.serveSource || !p.fromSource) && !isExcluded(p.route, opts.exclude));
}

function pageItem(p: MapPage): Item {
	return { section: sectionFor(p.route), optional: false, line: linkLine(p.title, p.route, p.description), sub: [] };
}

function linkLine(title: string, url: string, description?: string): string {
	const t = oneLine(title).replace(/[\\[\]]/g, '\\$&');
	const d = description ? oneLine(description) : '';
	return `- [${t}](${url})${d ? `: ${d}` : ''}`;
}

function headingLines(p: MapPage): string[] {
	const title = oneLine(p.title);
	return p.headings
		.map((h) => ({ level: h.level, text: oneLine(h.text) }))
		.filter((h) => h.text && !(h.level === 1 && h.text === title))
		.map((h) => `${'  '.repeat(Math.max(1, h.level - 1))}- ${h.text}`);
}

function sectionFor(route: string): string {
	const seg = route.split('/').find(Boolean);
	if (!seg) return ROOT_SECTION;
	let name = seg;
	try {
		name = decodeURIComponent(seg);
	} catch {
		/* keep raw */
	}
	const words = name.split(/[-_\s]+/).filter(Boolean);
	return words.length ? words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : ROOT_SECTION;
}

function oneLine(s: string): string {
	return String(s ?? '')
		.replace(/\s+/g, ' ')
		.trim();
}

function slug(s: string): string {
	let v = s;
	try {
		v = decodeURIComponent(s);
	} catch {
		/* keep raw */
	}
	return v
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, '-')
		.replace(/^-+|-+$/g, '');
}

/** Page text inside llms-full.txt must not start new page sections: `# x` → `## x` outside fences. */
function demoteH1(text: string): string {
	let inFence = false;
	return text
		.split('\n')
		.map((line) => {
			if (FENCE_RE.test(line)) inFence = !inFence;
			return !inFence && /^#\s/.test(line) ? `#${line}` : line;
		})
		.join('\n');
}
