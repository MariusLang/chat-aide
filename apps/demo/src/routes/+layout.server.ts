import { isTheme, themeFromUrl } from '$lib/params';
import type { LayoutServerLoad } from './$types';

const COOKIE = 'demo-theme';

/** Remembers the theme a visitor picked, for links that do not carry `?theme=`. */
export const load: LayoutServerLoad = ({ url, cookies }) => {
	const chosen = themeFromUrl(url);
	if (chosen) cookies.set(COOKIE, chosen, { path: '/', httpOnly: false, sameSite: 'lax' });
	const stored = cookies.get(COOKIE);
	return { theme: chosen ?? (isTheme(stored) ? stored : undefined) };
};
