import type { Action } from 'svelte/action';

/**
 * Moves every `[data-speed]` descendant vertically by its illustration's distance from the
 * viewport centre × speed, so each layer drifts only around its own scene. Does nothing under
 * reduced motion.
 */
export const parallax: Action<HTMLElement> = (node) => {
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
	const items = [...node.querySelectorAll<SVGElement | HTMLElement>('[data-speed]')];
	let frame = 0;
	const update = () => {
		frame = 0;
		for (const el of items) {
			const r = (el.closest('svg') ?? el).getBoundingClientRect();
			if (r.bottom < -200 || r.top > innerHeight + 200) continue;
			const offset = r.top + r.height / 2 - innerHeight / 2;
			el.style.translate = `0 ${(offset * Number(el.dataset.speed)).toFixed(1)}px`;
		}
	};
	const onScroll = () => (frame ||= requestAnimationFrame(update));
	addEventListener('scroll', onScroll, { passive: true });
	update();
	return {
		destroy() {
			removeEventListener('scroll', onScroll);
			cancelAnimationFrame(frame);
		}
	};
};

/** Progress of `node` through the viewport while it is pinned: 0 at its top, 1 at its end. */
export const scrollProgress: Action<HTMLElement, (p: number) => void> = (node, onProgress) => {
	let cb = onProgress;
	let frame = 0;
	const update = () => {
		frame = 0;
		const r = node.getBoundingClientRect();
		const span = r.height - innerHeight;
		cb(span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0);
	};
	const onScroll = () => (frame ||= requestAnimationFrame(update));
	addEventListener('scroll', onScroll, { passive: true });
	addEventListener('resize', onScroll);
	update();
	return {
		update(next) {
			cb = next;
		},
		destroy() {
			removeEventListener('scroll', onScroll);
			removeEventListener('resize', onScroll);
			cancelAnimationFrame(frame);
		}
	};
};
