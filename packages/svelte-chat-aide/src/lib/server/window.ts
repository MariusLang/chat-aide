import type { UIMessageLike } from '../shared/schemas';

function chars(m: UIMessageLike): number {
	let n = 0;
	for (const p of m.parts) n += p.text?.length ?? 0;
	return n;
}

/**
 * Server-side history window (spec §3.3 part 6): the last `historyTurns` turns (a turn is a
 * user message and the assistant messages after it), then the oldest messages dropped until
 * the text fits `historyChars`. The final user message is always kept whole (it is bounded by
 * `messageChars` already), and the window always starts on a user message.
 */
export function windowHistory(
	messages: UIMessageLike[],
	limits: { historyTurns: number; historyChars: number }
): UIMessageLike[] {
	const userIdx: number[] = [];
	messages.forEach((m, i) => {
		if (m.role === 'user') userIdx.push(i);
	});
	if (userIdx.length === 0) return [];

	const turns = Math.max(1, limits.historyTurns);
	const start = userIdx.length > turns ? userIdx[userIdx.length - turns]! : userIdx[0]!;
	const out = messages.slice(start);

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
	return out.slice(drop);
}
