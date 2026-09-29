/**
 * The docs pages: the repository's own `docs/*.md` plus the website-only pages in
 * `src/content`, rendered with marked and highlighted with shiki. Relative `.md` links (as they
 * work on GitHub) become `/docs/<slug>` links here.
 */
import { Marked, type Tokens } from 'marked';
import { createHighlighter } from 'shiki';
import { DOCS_NAV, type DocLink } from '$lib/docs-nav';

const repoDocs = import.meta.glob('../../../../../docs/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;
const localDocs = import.meta.glob('../../content/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const sources = new Map<string, string>();
for (const [path, raw] of Object.entries({ ...repoDocs, ...localDocs })) {
	sources.set(path.split('/').pop()!.replace(/\.md$/, ''), raw);
}

export interface TocEntry {
	id: string;
	text: string;
	depth: number;
}

export interface Doc {
	slug: string;
	title: string;
	description: string;
	html: string;
	toc: TocEntry[];
	markdown: string;
	prev?: DocLink;
	next?: DocLink;
}

const LANGS = ['ts', 'js', 'svelte', 'sh', 'css', 'json', 'html'];
const highlighter = await createHighlighter({ themes: ['github-light', 'github-dark'], langs: LANGS });

/** GitHub's heading anchors, so `deployment.md#without-origin` links keep working. */
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/<[^>]+>/g, '')
		.replace(/[^\p{L}\p{N}\s_-]/gu, '')
		.trim()
		.replace(/\s/g, '-');
}

function rewriteHref(href: string): string {
	const m = /^(?:\.\/)?([\w-]+)\.md(#.*)?$/.exec(href);
	return m ? `/docs/${m[1]}${m[2] ?? ''}` : href;
}

const plain = (s: string) =>
	s
		.replace(/<[^>]+>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");

function render(slug: string, source: string): Doc {
	const toc: TocEntry[] = [];
	const seen = new Map<string, number>();
	let title = slug;

	// The H1 is the page header; the first paragraph after it is the description.
	const h1 = /^# (.+)$/m.exec(source);
	if (h1) title = h1[1].trim();
	const body = h1 ? source.replace(h1[0], '') : source;
	const firstPara = body.trim().split(/\n\s*\n/)[0] ?? '';
	const description = firstPara.startsWith('#') || firstPara.startsWith('```')
		? ''
		: firstPara.replace(/\s+/g, ' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/`/g, '');

	const marked = new Marked({
		gfm: true,
		renderer: {
			heading({ tokens, depth }: Tokens.Heading) {
				const inner = this.parser.parseInline(tokens);
				const base = slugify(plain(inner));
				const n = seen.get(base) ?? 0;
				seen.set(base, n + 1);
				const id = n ? `${base}-${n}` : base;
				if (depth <= 3) toc.push({ id, text: plain(inner), depth });
				return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inner}</h${depth}>\n`;
			},
			link({ href, title: t, tokens }: Tokens.Link) {
				const inner = this.parser.parseInline(tokens);
				const to = rewriteHref(href);
				const external = /^https?:/.test(to);
				return `<a href="${to}"${t ? ` title="${t}"` : ''}${external ? ' rel="noopener" target="_blank"' : ''}>${inner}</a>`;
			},
			code({ text, lang }: Tokens.Code) {
				const l = (lang ?? '').trim().split(/\s/)[0];
				const known = LANGS.includes(l) ? l : 'text';
				const html = highlighter.codeToHtml(text, {
					lang: known,
					themes: { light: 'github-light', dark: 'github-dark' },
					defaultColor: false
				});
				return `<div class="code-block" data-lang="${l || 'text'}">${html}</div>\n`;
			},
			table(token: Tokens.Table) {
				const cell = (c: Tokens.TableCell, tag: 'th' | 'td') =>
					`<${tag}${c.align ? ` style="text-align:${c.align}"` : ''}>${this.parser.parseInline(c.tokens)}</${tag}>`;
				const head = `<tr>${token.header.map((c) => cell(c, 'th')).join('')}</tr>`;
				const rows = token.rows.map((r) => `<tr>${r.map((c) => cell(c, 'td')).join('')}</tr>`).join('');
				return `<div class="table-wrap"><table><thead>${head}</thead><tbody>${rows}</tbody></table></div>\n`;
			}
		}
	});

	const html = marked.parse(body, { async: false }) as string;
	const flat = DOCS_NAV.flatMap((g) => g.items);
	const i = flat.findIndex((d) => d.slug === slug);
	return {
		slug,
		title,
		description,
		html,
		toc: toc.filter((t) => t.depth === 2 || t.depth === 3),
		markdown: source,
		prev: flat[i - 1],
		next: flat[i + 1]
	};
}

const cache = new Map<string, Doc>();

export function getDoc(slug: string): Doc | undefined {
	if (!sources.has(slug) || !DOCS_NAV.some((g) => g.items.some((d) => d.slug === slug))) return undefined;
	let doc = cache.get(slug);
	if (!doc) {
		doc = render(slug, sources.get(slug)!);
		cache.set(slug, doc);
	}
	return doc;
}

/** Highlights one snippet the way the docs pages do. */
export function highlight(code: string, lang: string): string {
	return highlighter.codeToHtml(code, {
		lang: LANGS.includes(lang) ? lang : 'text',
		themes: { light: 'github-light', dark: 'github-dark' },
		defaultColor: false
	});
}
