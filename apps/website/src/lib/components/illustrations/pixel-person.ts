/**
 * Pixel-art people. A figure is assembled on a 24 × 31 grid from parts (head, hair, torso, arms
 * per pose, legs per walk frame), then every empty cell touching the figure becomes the outline.
 * The result is a list of horizontal runs, ready to render as SVG rects.
 */

export type Pose = 'stand' | 'wave' | 'phone' | 'point' | 'cheer';
export type Hair = 'short' | 'bun' | 'curly' | 'long' | 'bob' | 'bald';
export type Top = 'tee' | 'hoodie' | 'jacket';
export type Bottom = 'pants' | 'skirt';

export interface Look {
	hair: Hair;
	top: Top;
	bottom: Bottom;
	glasses: boolean;
	beard: boolean;
	bag: boolean;
	pose: Pose;
}

/**
 * Cell codes: s skin, h hair, t shirt, d shirt in shadow, w paper, p pants, k ink (shoes, frames),
 * e eye, n mouth, b blush, a strap, m phone screen, o outline.
 */
export type Code = 's' | 'h' | 't' | 'd' | 'w' | 'p' | 'k' | 'e' | 'n' | 'b' | 'a' | 'm' | 'o';

export interface Run {
	col: number;
	row: number;
	len: number;
	code: Code;
}

export const W = 24;
export const H = 31;
/** Row whose bottom edge is the ground. */
export const GROUND = 30;
/** Column pair the figure is centred on (between 11 and 12). */
export const CENTER = 12;

type Grid = (Code | null)[][];

function draw(look: Look, frame: 0 | 1): Grid {
	const g: Grid = Array.from({ length: H }, () => Array<Code | null>(W).fill(null));
	const fill = (c0: number, c1: number, r0: number, r1: number, code: Code) => {
		for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (r >= 0 && r < H && c >= 0 && c < W) g[r][c] = code;
	};
	const set = (c: number, r: number, code: Code | null) => {
		if (r >= 0 && r < H && c >= 0 && c < W) g[r][c] = code;
	};
	const long = look.top !== 'tee';
	const sleeve = (c0: number, c1: number, r0: number, r1: number, shade = false) => fill(c0, c1, r0, r1, shade ? 'd' : 't');

	// long hair and bob fall behind the head, so they go first
	if (look.hair === 'long') {
		fill(7, 8, 4, 14, 'h');
		fill(15, 16, 4, 14, 'h');
	} else if (look.hair === 'bob') {
		fill(7, 8, 4, 9, 'h');
		fill(15, 16, 4, 9, 'h');
	}

	// legs and shoes
	const spread = frame === 1;
	if (look.bottom === 'pants') {
		fill(9, 14, 20, 21, 'p');
		if (spread) {
			fill(9, 10, 22, 23, 'p');
			fill(13, 14, 22, 23, 'p');
			fill(8, 9, 24, 27, 'p');
			fill(14, 15, 24, 27, 'p');
		} else {
			fill(9, 10, 22, 27, 'p');
			fill(13, 14, 22, 27, 'p');
		}
	} else {
		fill(8, 15, 20, 22, 'p');
		if (spread) {
			fill(9, 10, 23, 23, 's');
			fill(13, 14, 23, 23, 's');
			fill(8, 9, 24, 27, 's');
			fill(14, 15, 24, 27, 's');
		} else {
			fill(9, 10, 23, 27, 's');
			fill(13, 14, 23, 27, 's');
		}
	}
	if (spread) {
		fill(7, 9, 28, 29, 'k');
		fill(14, 16, 28, 29, 'k');
	} else {
		fill(8, 10, 28, 29, 'k');
		fill(13, 15, 28, 29, 'k');
	}

	// torso, with the left column in shadow
	fill(8, 15, 12, 19, 't');
	fill(8, 8, 12, 19, 'd');
	if (look.top === 'jacket') {
		fill(11, 12, 12, 19, 'w');
		set(10, 12, 'w');
		set(13, 12, 'w');
	} else if (look.top === 'hoodie') {
		fill(9, 10, 11, 11, 't');
		fill(13, 14, 11, 11, 't');
		set(10, 13, 'w');
		set(13, 13, 'w');
		fill(10, 13, 17, 17, 'd');
	}
	if (look.bag) for (let i = 0; i < 7; i++) set(9 + i, 12 + i, 'a');

	// arms: back arm on the left (cols 6–7), front arm on the right (cols 16–17)
	const pose = look.pose;
	const armDown = (c0: number, shade: boolean) => {
		if (long) sleeve(c0, c0 + 1, 12, 17, shade);
		else {
			sleeve(c0, c0 + 1, 12, 13, shade);
			fill(c0, c0 + 1, 14, 17, 's');
		}
		fill(c0, c0 + 1, 18, 19, 's');
	};
	const armUp = (c0: number, dir: -1 | 1, shade: boolean) => {
		// shoulder at c0..c0+1, then a stair step out to the elbow, then the raised forearm
		sleeve(c0, c0 + 1, 12, 13, shade);
		const e = c0 + dir;
		const f = c0 + 2 * dir;
		if (long) {
			sleeve(e, e + 1, 10, 11, shade);
			sleeve(f, f + 1, 6, 9, shade);
		} else {
			fill(e, e + 1, 10, 11, 's');
			fill(f, f + 1, 6, 9, 's');
		}
		fill(f, f + 1, 4, 5, 's');
	};

	if (pose === 'cheer') armUp(6, -1, true);
	else armDown(6, true);

	if (pose === 'wave' || pose === 'cheer') armUp(16, 1, false);
	else if (pose === 'point') {
		sleeve(16, 17, 12, 13);
		fill(18, 21, 12, 13, long ? 't' : 's');
		fill(22, 22, 12, 13, 's');
	} else if (pose === 'phone') {
		sleeve(16, 17, 12, 14);
		fill(14, 17, 15, 16, long ? 't' : 's');
		fill(12, 13, 14, 16, 's');
		fill(11, 13, 10, 13, 'k');
		fill(12, 12, 11, 12, 'm');
	} else armDown(16, false);

	// neck and head, corners cut
	fill(11, 12, 11, 11, 's');
	fill(8, 15, 3, 10, 's');
	for (const [c, r] of [[8, 3], [15, 3], [8, 10], [15, 10]] as const) set(c, r, null);

	// face
	fill(10, 10, 6, 7, 'e');
	fill(13, 13, 6, 7, 'e');
	set(9, 8, 'b');
	set(14, 8, 'b');
	fill(11, 12, 9, 9, 'n');

	// hair on top
	switch (look.hair) {
		case 'short':
			fill(9, 14, 2, 2, 'h');
			fill(8, 15, 3, 3, 'h');
			fill(8, 11, 4, 4, 'h');
			set(15, 4, 'h');
			set(8, 5, 'h');
			break;
		case 'bun':
			fill(11, 12, 0, 0, 'h');
			fill(10, 13, 1, 1, 'h');
			fill(9, 14, 2, 2, 'h');
			fill(8, 15, 3, 3, 'h');
			set(8, 4, 'h');
			set(15, 4, 'h');
			break;
		case 'curly':
			for (const c of [8, 9, 11, 12, 14, 15]) set(c, 0, 'h');
			fill(7, 16, 1, 3, 'h');
			fill(7, 9, 4, 4, 'h');
			fill(14, 16, 4, 4, 'h');
			fill(7, 7, 5, 6, 'h');
			fill(16, 16, 5, 6, 'h');
			break;
		case 'long':
		case 'bob':
			fill(9, 14, 2, 2, 'h');
			fill(8, 15, 3, 3, 'h');
			fill(9, 12, 4, 4, 'h');
			break;
	}
	if (look.beard) {
		fill(9, 14, 9, 10, 'h');
		fill(8, 8, 7, 9, 'h');
		fill(15, 15, 7, 9, 'h');
		fill(11, 12, 9, 9, 's');
	}
	if (look.glasses) {
		fill(9, 14, 6, 6, 'k');
		set(9, 7, 'k');
		set(11, 7, 'k');
		set(12, 7, 'k');
		set(14, 7, 'k');
	}

	// outline: every empty cell touching the figure (4-neighbourhood)
	const out: [number, number][] = [];
	for (let r = 0; r < H; r++)
		for (let c = 0; c < W; c++) {
			if (g[r][c]) continue;
			const n = [g[r - 1]?.[c], g[r + 1]?.[c], g[r][c - 1], g[r][c + 1]];
			if (n.some((v) => v && v !== 'o')) out.push([c, r]);
		}
	for (const [c, r] of out) g[r][c] = 'o';
	return g;
}

function runs(g: Grid): Run[] {
	const list: Run[] = [];
	for (let r = 0; r < H; r++) {
		let c = 0;
		while (c < W) {
			const code = g[r][c];
			if (!code) {
				c++;
				continue;
			}
			let len = 1;
			while (c + len < W && g[r][c + len] === code) len++;
			list.push({ col: c, row: r, len, code });
			c += len;
		}
	}
	return list;
}

const cache = new Map<string, Run[]>();

/** Runs of one frame of a figure; frame 1 is the stride of the walk cycle. */
export function sprite(look: Look, frame: 0 | 1 = 0): Run[] {
	const key = JSON.stringify([look, frame]);
	let hit = cache.get(key);
	if (!hit) {
		hit = runs(draw(look, frame));
		cache.set(key, hit);
	}
	return hit;
}
