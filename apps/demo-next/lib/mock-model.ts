/**
 * The demo's mock model (AIDE_MOCK=1), so the Playwright suite runs without a provider key.
 * "what does /pricing say" calls `read_page` once, then quotes the page — which proves the site
 * was read over the network from a running Next.js server; anything else is echoed.
 */
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';

export const PRICING_PHRASE = 'Shipping is free over 50 euros';

const USAGE = {
	inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
	outputTokens: { total: 5, text: 5, reasoning: undefined }
};

type Part = Record<string, unknown>;
interface PromptMessage {
	role: string;
	content: unknown;
}

function textStream(text: string): Part[] {
	return [
		{ type: 'stream-start', warnings: [] },
		{ type: 'text-start', id: 't' },
		...text.split(/(?<= )/).map((delta) => ({ type: 'text-delta', id: 't', delta })),
		{ type: 'text-end', id: 't' },
		{ type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: USAGE }
	];
}

function toolStream(route: string): Part[] {
	return [
		{ type: 'stream-start', warnings: [] },
		{ type: 'tool-call', toolCallId: `call-${Date.now()}`, toolName: 'read_page', input: JSON.stringify({ route }) },
		{ type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_use' }, usage: USAGE }
	];
}

function lastUserText(prompt: PromptMessage[]): string {
	for (let i = prompt.length - 1; i >= 0; i--) {
		const m = prompt[i]!;
		if (m.role !== 'user') continue;
		if (typeof m.content === 'string') return m.content;
		if (Array.isArray(m.content)) {
			return m.content.map((p: { type?: string; text?: string }) => (p.type === 'text' ? (p.text ?? '') : '')).join('');
		}
	}
	return '';
}

export function mockModel(): MockLanguageModelV4 {
	return new MockLanguageModelV4({
		provider: 'mock',
		modelId: 'mock',
		doStream: async (options) => {
			const prompt = options.prompt as unknown as PromptMessage[];
			const text = lastUserText(prompt).trim();
			const last = prompt[prompt.length - 1];
			let parts: Part[];
			if (/what does \/pricing say/i.test(text)) {
				parts =
					last?.role === 'tool'
						? textStream(
								JSON.stringify(last.content).includes(PRICING_PHRASE)
									? `The pricing page says: ${PRICING_PHRASE}. See [Pricing](/pricing).`
									: 'I could not read that page.'
							)
						: toolStream('/pricing');
			} else {
				parts = textStream(`You asked: ${text}. See [Install](/docs/install).`);
			}
			return { stream: simulateReadableStream({ chunks: parts as never[], chunkDelayInMs: 5 }) };
		}
	});
}
