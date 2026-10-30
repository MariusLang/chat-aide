/**
 * Last path segments where a GET may act (spec §3.4). Kept apart from `site/route.ts` so the
 * browser-side answer renderer can use it without the server's schemas.
 */
export const SIDE_EFFECT_SEGMENTS = ['logout', 'logoff', 'signout', 'sign-out', 'unsubscribe', 'delete', 'remove'];

/** Whether a decoded pathname ends in a side-effect segment, in any letter case. */
export function hasSideEffectSegment(decodedPathname: string): boolean {
	const parts = decodedPathname.split('/').filter((p) => p !== '');
	const last = parts[parts.length - 1];
	return last !== undefined && SIDE_EFFECT_SEGMENTS.includes(last.toLowerCase());
}
