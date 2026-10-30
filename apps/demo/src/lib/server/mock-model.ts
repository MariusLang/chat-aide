/**
 * The demo's mock model (AIDE_MOCK=1): a `MockLanguageModelV4` whose answers are fixed functions
 * of the visitor's last message, so the Playwright suite runs without a provider key.
 *
 * - "hostile"                       → the hostile markdown corpus (acceptance #10)
 * - "what does /docs/install say"  → calls `read_page` once, then quotes the page (acceptance #15)
 * - anything else                   → echoes the message, with one same-origin link
 *
 * Every prompt is recorded (`recorder`) so the test-only endpoint can say whether the DOM text of
 * the current page reached the model (acceptance #14).
 */
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';

export const HOSTILE_ANSWER = [
	'Hostile corpus follows.',
	'',
	'Inline image: ![alt text](https://images.evil.example/x.png) and ![](https://images.evil.example/empty.png)',
	'',
	'Raw html: <img src="https://images.evil.example/raw.png" onerror="alert(1)"> <script>alert(1)</script>',
	'',
	'Links: [js](javascript:alert(1)) [data](data:text/html,<b>x</b>) [vb](vbscript:msgbox) [External site](https://external.example/page) [Privacy](/privacy)',
	'',
	'Reference image: ![ref alt][r]',
	'',
	'[r]: https://images.evil.example/ref.png'
].join('\n');

/** A phrase that only the /docs/install page contains; the answer quotes it. */
export const INSTALL_PHRASE = 'pnpm add @chat-aide/sveltekit ai';

export function echoAnswer(text: string): string {
	return `You asked: ${text}. See [Privacy](/privacy).`;
}

export const recorder: { prompts: string[] } = { prompts: [] };

const USAGE = {
	inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
	outputTokens: { total: 5, text: 5, reasoning: undefined }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Part = any;

function textStream(text: string): Part[] {
	// Several deltas, so the widget really streams.
	const words = text.split(/(?<= )/);
	return [
		{ type: 'stream-start', warnings: [] },
		{ type: 'text-start', id: 't' },
		...words.map((w) => ({ type: 'text-delta', id: 't', delta: w })),
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

interface PromptMessage {
	role: string;
	content: unknown;
}

function lastUserText(prompt: PromptMessage[]): string {
	for (let i = prompt.length - 1; i >= 0; i--) {
		const m = prompt[i]!;
		if (m.role !== 'user') continue;
		if (typeof m.content === 'string') return m.content;
		if (Array.isArray(m.content)) {
			return m.content
				.map((p: { type?: string; text?: string }) => (p.type === 'text' ? (p.text ?? '') : ''))
				.join('');
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
			const serialized = JSON.stringify(prompt);
			recorder.prompts.push(serialized);
			if (recorder.prompts.length > 50) recorder.prompts.shift();

			const text = lastUserText(prompt).trim();
			const last = prompt[prompt.length - 1];
			let parts: Part[];
			if (/hostile/i.test(text)) {
				parts = textStream(HOSTILE_ANSWER);
			} else if (/what does \/docs\/install say/i.test(text)) {
				if (last?.role === 'tool') {
					const quoted = JSON.stringify(last.content).includes(INSTALL_PHRASE);
					parts = textStream(
						quoted ? `The install page says to run \`${INSTALL_PHRASE}\`.` : 'I could not read that page.'
					);
				} else {
					parts = toolStream('/docs/install');
				}
			} else {
				parts = textStream(echoAnswer(text));
			}
			return { stream: simulateReadableStream({ chunks: parts, chunkDelayInMs: 5 }) };
		}
	});
}
