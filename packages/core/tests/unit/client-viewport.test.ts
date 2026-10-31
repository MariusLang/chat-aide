// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitViewport } from '../../src/client/viewport';

function phone(matches: boolean): void {
	vi.stubGlobal('matchMedia', (query: string) => ({
		matches,
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {}
	}));
}

afterEach(() => {
	vi.unstubAllGlobals();
	document.documentElement.style.overflow = '';
});

describe('fitViewport', () => {
	it('locks the page and exposes the visible box on a phone, and restores on destroy', () => {
		phone(true);
		document.documentElement.style.overflow = 'clip';
		const node = document.createElement('section');
		const fit = fitViewport(node);
		expect(document.documentElement.style.overflow).toBe('hidden');
		if (window.visualViewport) expect(node.style.getPropertyValue('--aide-vh')).toMatch(/px$/);
		fit.destroy();
		expect(document.documentElement.style.overflow).toBe('clip');
	});

	it('leaves a wide page alone', () => {
		phone(false);
		const node = document.createElement('section');
		const fit = fitViewport(node);
		expect(document.documentElement.style.overflow).toBe('');
		expect(node.style.getPropertyValue('--aide-vh')).toBe('');
		fit.destroy();
	});

	it('unlocks when disabled through update', () => {
		phone(true);
		const node = document.createElement('section');
		const fit = fitViewport(node);
		fit.update({ enabled: false });
		expect(document.documentElement.style.overflow).toBe('');
		fit.destroy();
	});
});
