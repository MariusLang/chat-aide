/**
 * The model behind AIDE_PREVIEW=1: no provider, one fixed answer, so the site and its chat can be
 * run and looked at without a key.
 */
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';

const ANSWER =
	'This is a preview without a model, so I cannot answer yet. Set `CHAT_AIDE_PROVIDER`, ' +
	'`CHAT_AIDE_MODEL` and `CHAT_AIDE_API_KEY` and restart. Meanwhile, see ' +
	'[Getting started](/docs/getting-started).';

const USAGE = {
	inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
	outputTokens: { total: 0, text: 0, reasoning: undefined }
};

export function previewModel() {
	return new MockLanguageModelV4({
		provider: 'preview',
		modelId: 'preview',
		doStream: async () => ({
			stream: simulateReadableStream({
				chunkDelayInMs: 25,
				chunks: [
					{ type: 'stream-start', warnings: [] },
					{ type: 'text-start', id: 't' },
					...ANSWER.split(/(?<= )/).map((delta) => ({ type: 'text-delta', id: 't', delta })),
					{ type: 'text-end', id: 't' },
					{ type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: USAGE }
				] as never[]
			})
		})
	});
}
