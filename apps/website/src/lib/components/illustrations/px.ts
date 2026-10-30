/**
 * Path builders for the pixel look of the illustrations: rectangles with one-step notched
 * corners, stair-step speech-bubble tails, and small shapes made of square cells.
 */

/** A rectangle whose corners are cut by one `s` × `s` step. */
export function notch(x: number, y: number, w: number, h: number, s = 6): string {
	return (
		`M${x + s} ${y}H${x + w - s}V${y + s}H${x + w}V${y + h - s}H${x + w - s}V${y + h}` +
		`H${x + s}V${y + h - s}H${x}V${y + s}H${x + s}Z`
	);
}

/**
 * A two-step tail hanging from a bubble's bottom edge at (`x`, `y`), `2s` wide, pointing down
 * and to the left (`dir` -1) or right (1).
 */
export function tail(x: number, y: number, s = 6, dir: -1 | 1 = -1): string {
	return dir === -1
		? `M${x} ${y}V${y + 2 * s}H${x + s}V${y + s}H${x + 2 * s}V${y}Z`
		: `M${x} ${y}H${x + 2 * s}V${y + 2 * s}H${x + s}V${y + s}H${x}Z`;
}

/** Cells (col, row) of a small grid, as one path of `s`-sized squares starting at (`x`, `y`). */
export function cells(x: number, y: number, list: [number, number][], s: number): string {
	return list.map(([c, r]) => `M${x + c * s} ${y + r * s}h${s}v${s}h${-s}Z`).join('');
}

/** A pixel check mark on a 5 × 4 grid. */
export const CHECK: [number, number][] = [
	[0, 1],
	[1, 2],
	[2, 3],
	[3, 2],
	[4, 1],
	[4, 0]
];

/** A pixel sparkle (plus sign) on a 5 × 5 grid. */
export const SPARKLE: [number, number][] = [
	[2, 0],
	[2, 1],
	[0, 2],
	[1, 2],
	[2, 2],
	[3, 2],
	[4, 2],
	[2, 3],
	[2, 4]
];
