import { describe, it, expect } from 'vitest';
import { estimateTokens, estimateTurn } from '../../../src/server/estimate';

describe('estimateTokens', () => {
	it('counts four ASCII characters to a token', () => {
		expect(estimateTokens('')).toBe(0);
		expect(estimateTokens('a')).toBe(1);
		expect(estimateTokens('a'.repeat(4000))).toBe(1000);
		expect(estimateTokens('The quick brown fox jumps over the lazy dog.')).toBe(11);
	});

	it('counts two UTF-8 bytes to a token outside ASCII', () => {
		expect(estimateTokens('題'.repeat(4000))).toBe(6000);
		expect(estimateTokens('한'.repeat(100))).toBe(150);
		expect(estimateTokens('ж'.repeat(100))).toBe(100);
		expect(estimateTokens('é'.repeat(100))).toBe(100);
		expect(estimateTokens('😀'.repeat(10))).toBe(20);
	});

	it('counts mixed text part by part', () => {
		expect(estimateTokens('abcd'.repeat(10) + '題'.repeat(10))).toBe(10 + 15);
	});

	it('counts CJK text several times higher than the same length of ASCII', () => {
		expect(estimateTokens('題'.repeat(4000))).toBe(6 * estimateTokens('a'.repeat(4000)));
	});
});

describe('estimateTurn', () => {
	const limits = { maxSteps: 3, pageChars: 12_000, maxOutputTokens: 1_024 };
	// As JSON each prompt is 4 000 characters: 3 998 and the two quotes.
	const ascii = 'a'.repeat(3_998);
	const cjk = '題'.repeat(3_998);

	it('counts every step as the prompt, a page read and maxOutputTokens', () => {
		// (4 000 + 12 000) / 4 + 1 024 per step, as four characters per token counts ASCII.
		expect(estimateTurn(ascii, limits)).toBe(3 * (4_000 + 1_024));
		expect(estimateTurn(ascii, { ...limits, maxSteps: 1 })).toBe(4_000 + 1_024);
		expect(estimateTurn(ascii, { ...limits, pageChars: 0, maxOutputTokens: 0 })).toBe(3 * 1_000);
	});

	it('counts the page read at the tokens per character of the prompt', () => {
		// 5 998 tokens for 4 000 characters, so 12 000 characters of page count 17 994.
		expect(estimateTurn(cjk, limits)).toBe(3 * (5_998 + 17_994 + 1_024));
	});

	it('counts a CJK prompt at no less than a token per character, where ASCII counts a quarter', () => {
		const perStep = estimateTurn(cjk, { ...limits, maxSteps: 1, maxOutputTokens: 0 });
		expect(perStep).toBeGreaterThanOrEqual(3_998 + 12_000);
		expect(perStep).toBeGreaterThan(5 * estimateTurn(ascii, { ...limits, maxSteps: 1, maxOutputTokens: 0 }));
	});

	it('reads the whole prompt object, not only strings', () => {
		const prompt = { instructions: [{ role: 'system', content: '題'.repeat(100) }], messages: [] };
		expect(estimateTurn(prompt, { maxSteps: 1, pageChars: 0, maxOutputTokens: 0 })).toBe(
			Math.ceil((JSON.stringify(prompt).length - 100) / 4 + 150)
		);
	});
});
