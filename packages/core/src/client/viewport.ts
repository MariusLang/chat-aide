/**
 * The full-screen chat on a phone (spec §3.8): while the window is open on a small viewport, the
 * page behind it does not scroll, and the window follows the visual viewport so the composer stays
 * above the on-screen keyboard (iOS Safari keeps the layout viewport, and `100dvh`, at full
 * height while the keyboard is up). The window reads the visible box from `--aide-vh` and
 * `--aide-vt`. Usable as a Svelte action: `use:fitViewport`.
 */

export interface FitViewportOptions {
	/** The media query under which the window is full-screen (default `(max-width: 479.98px)`). */
	query?: string;
	/** Set false to leave the page and the window alone (an inline window). */
	enabled?: boolean;
}

export const PHONE_QUERY = '(max-width: 479.98px)';

export function fitViewport(
	node: HTMLElement,
	options: FitViewportOptions = {}
): { update(options: FitViewportOptions): void; destroy(): void } {
	let enabled = options.enabled ?? true;
	const mq = typeof matchMedia === 'function' ? matchMedia(options.query ?? PHONE_QUERY) : undefined;
	const vv = typeof window !== 'undefined' ? window.visualViewport : null;
	const root = typeof document !== 'undefined' ? document.documentElement : null;
	let restore: string | undefined;

	function lock(on: boolean): void {
		if (!root) return;
		if (on && restore === undefined) {
			restore = root.style.overflow;
			root.style.overflow = 'hidden';
		} else if (!on && restore !== undefined) {
			root.style.overflow = restore;
			restore = undefined;
		}
	}

	function sync(): void {
		const on = enabled && (mq?.matches ?? false);
		lock(on);
		if (on && vv) {
			node.style.setProperty('--aide-vh', `${vv.height}px`);
			node.style.setProperty('--aide-vt', `${vv.offsetTop}px`);
		} else {
			node.style.removeProperty('--aide-vh');
			node.style.removeProperty('--aide-vt');
		}
	}

	mq?.addEventListener?.('change', sync);
	vv?.addEventListener('resize', sync);
	vv?.addEventListener('scroll', sync);
	sync();

	return {
		update(next) {
			enabled = next.enabled ?? true;
			sync();
		},
		destroy() {
			mq?.removeEventListener?.('change', sync);
			vv?.removeEventListener('resize', sync);
			vv?.removeEventListener('scroll', sync);
			lock(false);
		}
	};
}
