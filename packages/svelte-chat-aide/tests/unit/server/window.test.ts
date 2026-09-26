import { describe, it, expect } from 'vitest';
import { windowHistory } from '../../../src/lib/server/window';
import type { UIMessageLike } from '../../../src/lib/shared/schemas';

const msg = (role: 'user' | 'assistant', text: string): UIMessageLike => ({
	role,
	parts: [{ type: 'text', text }]
});

function thread(turns: number, len = 5): UIMessageLike[] {
	const out: UIMessageLike[] = [];
	for (let i = 0; i < turns; i++) {
		out.push(msg('user', `u${i}`.padEnd(len, '.')));
		if (i < turns - 1) out.push(msg('assistant', `a${i}`.padEnd(len, '.')));
	}
	return out;
}

const text = (m: UIMessageLike) => m.parts.map((p) => p.text ?? '').join('');
const limits = { historyTurns: 12, historyChars: 16_000 };

describe('windowHistory', () => {
	it('keeps a short thread whole', () => {
		const t = thread(3);
		expect(windowHistory(t, limits)).toEqual(t);
	});

	it('30 turns -> the last 12', () => {
		const out = windowHistory(thread(30), limits);
		const users = out.filter((m) => m.role === 'user');
		expect(users).toHaveLength(12);
		expect(out[0]!.role).toBe('user');
		expect(text(out[0]!).startsWith('u18')).toBe(true);
		expect(text(out.at(-1)!).startsWith('u29')).toBe(true);
	});

	it('a turn is a user message plus the following assistant messages', () => {
		const t = [
			msg('user', 'u0'),
			msg('assistant', 'a0'),
			msg('user', 'u1'),
			msg('assistant', 'a1a'),
			msg('assistant', 'a1b'),
			msg('user', 'u2')
		];
		const out = windowHistory(t, { historyTurns: 2, historyChars: 1000 });
		expect(out.map(text)).toEqual(['u1', 'a1a', 'a1b', 'u2']);
	});

	it('the chars cap drops the oldest messages first', () => {
		const t = thread(5, 100); // 9 messages x 100 chars
		const out = windowHistory(t, { historyTurns: 12, historyChars: 350 });
		const total = out.reduce((n, m) => n + text(m).length, 0);
		expect(total).toBeLessThanOrEqual(350);
		expect(text(out.at(-1)!).startsWith('u4')).toBe(true);
		expect(out[0]!.role).toBe('user');
		expect(text(out[0]!).startsWith('u3')).toBe(true);
	});

	it('always keeps the final user message whole, even over the chars cap', () => {
		const t = [msg('user', 'old'), msg('assistant', 'reply'), msg('user', 'x'.repeat(500))];
		const out = windowHistory(t, { historyTurns: 12, historyChars: 100 });
		expect(out).toHaveLength(1);
		expect(text(out[0]!)).toBe('x'.repeat(500));
	});

	it('a client sending 500 messages still yields at most 12 turns', () => {
		const t: UIMessageLike[] = [];
		for (let i = 0; i < 250; i++) t.push(msg('user', `u${i}`), msg('assistant', `a${i}`));
		t.push(msg('user', 'final'));
		const out = windowHistory(t, limits);
		expect(out.filter((m) => m.role === 'user').length).toBeLessThanOrEqual(12);
		expect(text(out.at(-1)!)).toBe('final');
	});

	it('does not mutate its input', () => {
		const t = thread(30);
		const copy = structuredClone(t);
		windowHistory(t, { historyTurns: 2, historyChars: 10 });
		expect(t).toEqual(copy);
	});

	it('empty thread -> empty', () => {
		expect(windowHistory([], limits)).toEqual([]);
	});
});
