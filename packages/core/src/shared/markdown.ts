/**
 * Answer markdown → a small, safe node tree (spec §3.6 "What an answer may render", §3.8).
 *
 * Only marked's lexer is used; no HTML string is ever produced. The tree has no image node,
 * raw HTML becomes its own source text, and links survive only as http(s) and, unless
 * `answerLinks: 'any'`, only to the configured origin. Browser-safe: no Node imports.
 */
import { Lexer, getDefaults, type Token, type Tokens } from 'marked';

export type MdInline =
	| { t: 'text'; v: string }
	| { t: 'code'; v: string }
	| { t: 'em' | 'strong' | 'del'; c: MdInline[] }
	| { t: 'link'; href: string; external: boolean; c: MdInline[] }
	| { t: 'br' };

export type MdBlock =
	| { t: 'p'; c: MdInline[] }
	| { t: 'h'; level: 1 | 2 | 3 | 4 | 5 | 6; c: MdInline[] }
	| { t: 'list'; ordered: boolean; start?: number; items: MdBlock[][] }
	| { t: 'code'; lang?: string; v: string }
	| { t: 'quote'; c: MdBlock[] }
	| { t: 'hr' };

export interface MdOptions {
	origin: string;
	answerLinks: 'same-origin' | 'any';
}

interface Ctx {
	origin: string;
	any: boolean;
}

const NAMED: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' '
};

/** Decodes the few character references that markdown text commonly carries. */
function decode(s: string): string {
	return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z]+);/g, (whole, ref: string) => {
		if (ref[0] !== '#') return Object.hasOwn(NAMED, ref) ? NAMED[ref]! : whole;
		const n = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
		if (n === 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return '�';
		return String.fromCodePoint(n);
	});
}

/** Resolves an answer link; `null` means "render its text only". */
function resolveLink(href: string, ctx: Ctx): { href: string; external: boolean } | null {
	let url: URL;
	try {
		url = new URL(href, ctx.origin);
	} catch {
		return null;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
	if (url.origin === ctx.origin) {
		// `/.//evil.com` keeps this origin but its bare path would be a protocol-relative href.
		if (url.pathname.startsWith('//')) return null;
		return { href: url.pathname + url.search + url.hash, external: false };
	}
	return ctx.any ? { href: url.href, external: true } : null;
}

function pushText(out: MdInline[], v: string): void {
	if (!v) return;
	const last = out[out.length - 1];
	if (last && last.t === 'text') last.v += v;
	else out.push({ t: 'text', v });
}

function pushAll(out: MdInline[], xs: MdInline[]): void {
	for (const x of xs) {
		if (x.t === 'text') pushText(out, x.v);
		else out.push(x);
	}
}

function inline(tokens: Token[] | undefined, ctx: Ctx): MdInline[] {
	const out: MdInline[] = [];
	for (const tok of tokens ?? []) {
		switch (tok.type) {
			case 'text': {
				const t = tok as Tokens.Text;
				if (t.tokens?.length) pushAll(out, inline(t.tokens, ctx));
				else pushText(out, decode(t.text));
				break;
			}
			case 'escape':
				pushText(out, (tok as Tokens.Escape).text);
				break;
			case 'codespan':
				out.push({ t: 'code', v: (tok as Tokens.Codespan).text });
				break;
			case 'br':
				out.push({ t: 'br' });
				break;
			case 'em':
			case 'strong':
			case 'del': {
				const c = inline((tok as Tokens.Em).tokens, ctx);
				if (c.length) out.push({ t: tok.type, c });
				break;
			}
			case 'link': {
				const l = tok as Tokens.Link;
				const c = inline(l.tokens, ctx);
				const target = resolveLink(l.href, ctx);
				if (target && c.length) out.push({ t: 'link', ...target, c });
				else pushAll(out, c);
				break;
			}
			case 'image':
				// Never an image: its alt as text, or nothing.
				pushText(out, decode((tok as Tokens.Image).text));
				break;
			case 'html':
				pushText(out, tok.raw);
				break;
			case 'checkbox':
				pushText(out, (tok as Tokens.Checkbox).checked ? '[x] ' : '[ ] ');
				break;
			default: {
				const g = tok as Tokens.Generic;
				if (Array.isArray(g.tokens)) pushAll(out, inline(g.tokens as Token[], ctx));
				else pushText(out, g.raw);
			}
		}
	}
	return out;
}

function tableRow(cells: Tokens.TableCell[], ctx: Ctx): MdBlock {
	const c: MdInline[] = [];
	cells.forEach((cell, i) => {
		if (i > 0) pushText(c, ' | ');
		pushAll(c, inline(cell.tokens, ctx));
	});
	return { t: 'p', c };
}

function blocks(tokens: Token[], ctx: Ctx): MdBlock[] {
	const out: MdBlock[] = [];
	for (const tok of tokens) {
		switch (tok.type) {
			case 'space':
			case 'def':
				break;
			case 'paragraph':
			case 'text': {
				const t = tok as Tokens.Paragraph | Tokens.Text;
				const c = t.tokens ? inline(t.tokens, ctx) : [{ t: 'text' as const, v: decode(t.text) }];
				if (c.length) out.push({ t: 'p', c });
				break;
			}
			case 'heading': {
				const h = tok as Tokens.Heading;
				const level = Math.min(6, Math.max(1, h.depth)) as 1 | 2 | 3 | 4 | 5 | 6;
				out.push({ t: 'h', level, c: inline(h.tokens, ctx) });
				break;
			}
			case 'code': {
				const k = tok as Tokens.Code;
				const lang = k.lang?.trim().split(/\s+/)[0];
				out.push(lang ? { t: 'code', lang, v: k.text } : { t: 'code', v: k.text });
				break;
			}
			case 'blockquote':
				out.push({ t: 'quote', c: blocks((tok as Tokens.Blockquote).tokens, ctx) });
				break;
			case 'hr':
				out.push({ t: 'hr' });
				break;
			case 'list': {
				const l = tok as Tokens.List;
				const items = l.items.map((item) => blocks(item.tokens, ctx));
				if (l.ordered && typeof l.start === 'number') {
					out.push({ t: 'list', ordered: true, start: l.start, items });
				} else {
					out.push({ t: 'list', ordered: l.ordered, items });
				}
				break;
			}
			case 'table': {
				const tb = tok as Tokens.Table;
				out.push(tableRow(tb.header, ctx));
				for (const row of tb.rows) out.push(tableRow(row, ctx));
				break;
			}
			case 'html': {
				const v = tok.raw.replace(/\n+$/, '');
				if (v) out.push({ t: 'p', c: [{ t: 'text', v }] });
				break;
			}
			default: {
				const g = tok as Tokens.Generic;
				if (Array.isArray(g.tokens)) {
					const c = inline(g.tokens as Token[], ctx);
					if (c.length) out.push({ t: 'p', c });
				} else if (g.raw?.trim()) {
					out.push({ t: 'p', c: [{ t: 'text', v: g.raw.trim() }] });
				}
			}
		}
	}
	return out;
}

/**
 * Parses an answer into safe nodes. Uses marked's lexer only (never `marked.parse`), with a
 * private option set so a global `marked.use()` elsewhere on the page cannot change it.
 */
export function parseAnswer(md: string, opts: MdOptions): MdBlock[] {
	const ctx: Ctx = { origin: new URL(opts.origin).origin, any: opts.answerLinks === 'any' };
	const lexer = new Lexer({ ...getDefaults(), gfm: true, breaks: false, pedantic: false });
	return blocks(lexer.lex(md), ctx);
}
