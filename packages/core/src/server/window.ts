import type { UIMessageLike } from '../shared/schemas.js';

function chars(m: UIMessageLike): number {
	let n = 0;
	for (const p of m.parts) n += p.text?.length ?? 0;
	return n;
}

/** A copy of `m` whose text parts together hold at most `max` characters. */
function truncate(m: UIMessageLike, max: number): UIMessageLike {
	if (chars(m) <= max) return m;
	let left = max;
	const parts: UIMessageLike['parts'] = [];
	for (const p of m.parts) {
		if (left <= 0) break;
		const text = p.text ?? '';
		parts.push({ ...p, text: text.slice(0, left) });
		left -= Math.min(text.length, left);
	}
	return { ...m, parts };
}

/**
 * Server-side history window (spec §3.3 part 6): the last `historyTurns` turns (a turn is a
 * user message and the assistant messages after it), each assistant message truncated to
 * `messageChars` (an answer may be longer than a question may), then the oldest messages
 * dropped until the text fits `historyChars`. The final user message is always kept,
 * truncated to `historyChars` if it alone exceeds it, and the window always starts on a user
 * message.
 */
export function windowHistory(
	messages: UIMessageLike[],
	limits: { historyTurns: number; historyChars: number; messageChars?: number }
): UIMessageLike[] {
	const userIdx: number[] = [];
	messages.forEach((m, i) => {
		if (m.role === 'user') userIdx.push(i);
	});
	if (userIdx.length === 0) return [];

	const turns = Math.max(1, limits.historyTurns);
	const start = userIdx.length > turns ? userIdx[userIdx.length - turns]! : userIdx[0]!;
	const messageChars = limits.messageChars;
	const out = messages
		.slice(start)
		.map((m) =>
			m.role === 'assistant' && messageChars !== undefined ? truncate(m, messageChars) : m
		);

	let lastUser = -1;
	for (let i = out.length - 1; i >= 0; i--) {
		if (out[i]!.role === 'user') {
			lastUser = i;
			break;
		}
	}

	let total = out.reduce((n, m) => n + chars(m), 0);
	let drop = 0;
	while (total > limits.historyChars && drop < lastUser) {
		total -= chars(out[drop]!);
		drop++;
	}
	// Do not start on an orphaned assistant reply.
	while (drop < lastUser && out[drop]!.role !== 'user') drop++;
	const kept = out.slice(drop);
	// Still over: only the final user message (and replies after it) can remain; cut it.
	if (kept.reduce((n, m) => n + chars(m), 0) > limits.historyChars) {
		const i = lastUser - drop;
		kept[i] = truncate(kept[i]!, Math.max(0, limits.historyChars));
	}
	return kept;
}
