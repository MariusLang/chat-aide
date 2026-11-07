// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { focusInWindow, trapFocus } from '../../src/client/focus-trap';

function tab(node: HTMLElement, shiftKey = false): void {
	const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
	node.dispatchEvent(event);
}

describe('trapFocus', () => {
	it('focuses the initial field, cycles Tab and Shift+Tab, and restores focus', () => {
		document.body.innerHTML = `
			<button id="launcher">Open</button>
			<section id="win">
				<button id="close">x</button>
				<textarea data-part="input"></textarea>
				<button id="send">Send</button>
			</section>`;
		const launcher = document.getElementById('launcher')!;
		launcher.focus();
		const win = document.getElementById('win')!;
		const trap = trapFocus(win, { initial: '[data-part="input"]' });
		expect(document.activeElement?.getAttribute('data-part')).toBe('input');

		document.getElementById('send')!.focus();
		tab(document.getElementById('send')!);
		expect(document.activeElement?.id).toBe('close');

		tab(document.getElementById('close')!, true);
		expect(document.activeElement?.id).toBe('send');

		trap.destroy();
		expect(document.activeElement?.id).toBe('launcher');
	});

	it('does nothing when disabled', () => {
		document.body.innerHTML = `<button id="a">a</button><section id="win"><button id="b">b</button></section>`;
		document.getElementById('a')!.focus();
		const trap = trapFocus(document.getElementById('win')!, { enabled: false });
		expect(document.activeElement?.id).toBe('a');
		trap.destroy();
		expect(document.activeElement?.id).toBe('a');
	});
});

describe('focusInWindow', () => {
	it('moves focus to the input of the window holding the element', () => {
		document.body.innerHTML = `
			<section data-part="window">
				<header data-part="header" tabindex="-1">Chat</header>
				<button id="suggestion">Ask</button>
				<textarea data-part="input"></textarea>
			</section>`;
		const suggestion = document.getElementById('suggestion')!;
		suggestion.focus();
		focusInWindow(suggestion);
		expect(document.activeElement?.getAttribute('data-part')).toBe('input');
		focusInWindow(suggestion, '[data-part="header"]');
		expect(document.activeElement?.getAttribute('data-part')).toBe('header');
	});

	it('does nothing outside a window', () => {
		document.body.innerHTML = `<button id="a">a</button><textarea data-part="input"></textarea>`;
		const a = document.getElementById('a')!;
		a.focus();
		focusInWindow(a);
		expect(document.activeElement?.id).toBe('a');
	});
});
