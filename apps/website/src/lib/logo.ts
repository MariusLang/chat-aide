/**
 * The pixel logo: a yellow speech bubble behind a cobalt one with three dots, on a 19 × 15 grid,
 * outlined in ink. Shared by the header, the footer and the generated favicon.
 */

/** y marker yellow, b cobalt, w dot, k ink. */
export type LogoCode = 'y' | 'b' | 'w' | 'k';
export interface LogoRun {
	col: number;
	row: number;
	len: number;
	code: LogoCode;
}

export const LOGO_W = 19;
export const LOGO_H = 15;

function build(): LogoRun[] {
	const g: (LogoCode | null)[][] = Array.from({ length: LOGO_H }, () => Array(LOGO_W).fill(null));
	const fill = (c0: number, c1: number, r0: number, r1: number, v: LogoCode | null) => {
		for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = v;
	};
	// back bubble and its tail
	fill(1, 10, 1, 8, 'y');
	g[9][2] = 'y';
	g[10][1] = 'y';
	// front bubble: an ink ring with notched corners around a cobalt body, tail to the right
	fill(5, 17, 4, 12, 'k');
	for (const [c, r] of [[5, 4], [17, 4], [5, 12], [17, 12]]) g[r][c] = null;
	fill(6, 16, 5, 11, 'b');
	g[12][14] = 'b';
	g[12][15] = 'b';
	g[13][15] = 'b';
	// three dots
	for (const c of [7, 10, 13]) fill(c, c + 1, 7, 8, 'w');
	// outline everything that is still empty and touches a filled cell
	const out: [number, number][] = [];
	for (let r = 0; r < LOGO_H; r++)
		for (let c = 0; c < LOGO_W; c++) {
			if (g[r][c]) continue;
			if ([g[r - 1]?.[c], g[r + 1]?.[c], g[r][c - 1], g[r][c + 1]].some(Boolean)) out.push([c, r]);
		}
	for (const [c, r] of out) g[r][c] = 'k';

	const runs: LogoRun[] = [];
	for (let r = 0; r < LOGO_H; r++)
		for (let c = 0; c < LOGO_W; ) {
			const v = g[r][c];
			if (!v) {
				c++;
				continue;
			}
			let len = 1;
			while (c + len < LOGO_W && g[r][c + len] === v) len++;
			runs.push({ col: c, row: r, len, code: v });
			c += len;
		}
	return runs;
}

export const LOGO_RUNS = build();

/** The logo as a standalone SVG document with literal colours, for the favicon. */
export function logoSvg(): string {
	const color: Record<LogoCode, string> = { y: '#ffe01b', b: '#1f3bff', w: '#ffffff', k: '#000000' };
	const rects = LOGO_RUNS.map((r) => `<rect x="${r.col}" y="${r.row}" width="${r.len}" height="1" fill="${color[r.code]}"/>`).join('');
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -3 ${LOGO_W + 2} ${LOGO_W + 2}" shape-rendering="crispEdges">${rects}</svg>`;
}
