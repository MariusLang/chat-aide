/** The demo's widget switches, read from the URL so every Playwright case is one `goto`. */
export type Theme = 'shadcn' | 'plain' | 'headless';
export const THEMES: Theme[] = ['shadcn', 'plain', 'headless'];
export const POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const;
export type Position = (typeof POSITIONS)[number];
export type Mode = 'floating' | 'inline' | 'sheet';

export interface WidgetParams {
	theme: Theme;
	position: Position;
	mode: Mode;
	/** `?launcher=header`: the launcher is a snippet rendered in the site header. */
	headerLauncher: boolean;
}

export function isTheme(value: unknown): value is Theme {
	return typeof value === 'string' && (THEMES as string[]).includes(value);
}

/** The theme named by the URL (`?theme=` or `/themes/<theme>`), if any. */
export function themeFromUrl(url: URL): Theme | undefined {
	const q = url.searchParams.get('theme');
	if (isTheme(q)) return q;
	const fromPath = /^\/themes\/(shadcn|plain|headless)\/?$/.exec(url.pathname)?.[1];
	return isTheme(fromPath) ? fromPath : undefined;
}

/**
 * `sticky` is the theme chosen earlier in the session (a cookie), so that a link without the
 * query — a same-origin link in an answer, say — stays in the theme being looked at.
 */
export function widgetParams(url: URL, sticky?: Theme): WidgetParams {
	const q = url.searchParams;
	const theme = themeFromUrl(url) ?? sticky ?? 'shadcn';
	const position = (POSITIONS as readonly string[]).includes(q.get('position') ?? '')
		? (q.get('position') as Position)
		: 'bottom-right';
	const mode = (['floating', 'inline', 'sheet'] as string[]).includes(q.get('mode') ?? '') ? (q.get('mode') as Mode) : 'floating';
	return { theme, position, mode, headerLauncher: q.get('launcher') === 'header' };
}

/** `path` with the current widget switches kept, so client-side navigation stays in one theme. */
export function keep(url: URL, path: string): string {
	const q = new URLSearchParams(url.search);
	const fromPath = /^\/themes\/(shadcn|plain|headless)\/?$/.exec(url.pathname)?.[1];
	if (fromPath && !q.has('theme')) q.set('theme', fromPath);
	const s = q.toString();
	return s ? `${path}?${s}` : path;
}
