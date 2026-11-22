import type { Limits } from '../shared/limits.js';

/**
 * The tokens of `text`, counted without a tokenizer and on the high side: four ASCII characters
 * to a token, and two UTF-8 bytes to a token for everything else. Text outside ASCII does not
 * pack four characters into a token: this counts a CJK character as 1.5 tokens, a Cyrillic,
 * Greek, Arabic or accented Latin letter as 1, and an emoji as 2.
 */
export function estimateTokens(text: string): number {
	let ascii = 0;
	let bytes = 0;
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		if (c < 0x80) ascii++;
		else if (c < 0x800) bytes += 2;
		// Half of a surrogate pair: the pair is one character of four bytes.
		else if (c >= 0xd800 && c <= 0xdfff) bytes += 2;
		else bytes += 3;
	}
	return Math.ceil(ascii / 4 + bytes / 2);
}

/**
 * The tokens a turn may use, counted before it starts (spec §3.5): every step may resend the
 * prompt plus a page read, and write up to `maxOutputTokens`. The page to be read is not known
 * yet, so its `pageChars` count at the prompt's own tokens per character: the prompt holds the
 * site's outline and current page, and the site's other pages are written in the same script.
 */
export function estimateTurn(
	prompt: unknown,
	limits: Pick<Limits, 'maxSteps' | 'pageChars' | 'maxOutputTokens'>
): number {
	const text = JSON.stringify(prompt) ?? '';
	const tokens = estimateTokens(text);
	const perChar = text.length > 0 ? tokens / text.length : 0.25;
	return limits.maxSteps * (Math.ceil(tokens + limits.pageChars * perChar) + limits.maxOutputTokens);
}
