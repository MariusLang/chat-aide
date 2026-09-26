/**
 * A small focus trap for the chat dialog (spec §3.8): Tab and Shift+Tab cycle inside the node,
 * the first field is focused on mount, and focus returns to whatever held it before (the
 * launcher) when the trap is destroyed. Usable as a Svelte action: `use:trapFocus`.
 */

export interface FocusTrapOptions {
	/** Selector of the element focused first (default: the first focusable element). */
	initial?: string;
	/** Set false to leave the node untrapped (an inline window). */
	enabled?: boolean;
}

const FOCUSABLE = [
	'a[href]',
	'button:not([disabled])',
	'textarea:not([disabled])',
	'input:not([disabled]):not([type="hidden"])',
	'select:not([disabled])',
	'[tabindex]:not([tabindex="-1"])'
].join(',');

export function focusableIn(node: HTMLElement): HTMLElement[] {
	return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
		(el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true'
	);
}

export function trapFocus(
	node: HTMLElement,
	options: FocusTrapOptions = {}
): { update(options: FocusTrapOptions): void; destroy(): void } {
	let enabled = options.enabled ?? true;
	const previous =
		typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;

	function onKeydown(event: KeyboardEvent): void {
		if (!enabled || event.key !== 'Tab') return;
		const items = focusableIn(node);
		if (items.length === 0) {
			event.preventDefault();
			return;
		}
		const first = items[0]!;
		const last = items[items.length - 1]!;
		const active = document.activeElement;
		const inside = active instanceof HTMLElement && node.contains(active);
		if (event.shiftKey && (active === first || !inside)) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && (active === last || !inside)) {
			event.preventDefault();
			first.focus();
		}
	}

	node.addEventListener('keydown', onKeydown);
	if (enabled) {
		const target =
			(options.initial ? node.querySelector<HTMLElement>(options.initial) : null) ??
			focusableIn(node)[0];
		target?.focus();
	}

	return {
		update(next) {
			enabled = next.enabled ?? true;
		},
		destroy() {
			node.removeEventListener('keydown', onKeydown);
			if (enabled && previous && typeof previous.focus === 'function' && previous.isConnected) {
				previous.focus();
			}
		}
	};
}
