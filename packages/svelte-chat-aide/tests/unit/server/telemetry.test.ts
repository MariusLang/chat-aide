import { describe, it, expect, afterEach } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { registerTelemetry, streamText, type Telemetry } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { createChatHandler } from '../../../src/lib/server/handler';
import { createFakeSite, htmlPage } from '../../fixtures/site';

const ORIGIN = 'https://example.com';

function model() {
	return new MockLanguageModelV4({
		doStream: async () => ({
			stream: convertArrayToReadableStream([
				{ type: 'stream-start', warnings: [] },
				{ type: 'text-start', id: 't' },
				{ type: 'text-delta', id: 't', delta: 'Answer.' },
				{ type: 'text-end', id: 't' },
				{
					type: 'finish',
					finishReason: { unified: 'stop', raw: 'stop' },
					usage: {
						inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined },
						outputTokens: { total: 1, text: 1, reasoning: undefined }
					}
				}
			])
		})
	});
}

/** An integration that records every event it receives, on every hook it can have. */
function recordingIntegration(): { integration: Telemetry; events: string[] } {
	const events: string[] = [];
	const hooks = [
		'onStart',
		'onStepStart',
		'onLanguageModelCallStart',
		'onLanguageModelCallEnd',
		'onToolExecutionStart',
		'onToolExecutionEnd',
		'onChunk',
		'onStepFinish',
		'onStepEnd',
		'onFinish',
		'onEnd',
		'onError',
		'onAbort'
	];
	const integration = Object.fromEntries(
		hooks.map((h) => [h, (e: unknown) => void events.push(`${h}:${JSON.stringify(e)?.slice(0, 80)}`)])
	) as Telemetry;
	return { integration, events };
}

afterEach(() => {
	globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = undefined;
});

describe('telemetry (acceptance #24)', () => {
	it('control: a globally registered integration does record a plain streamText call', async () => {
		const { integration, events } = recordingIntegration();
		registerTelemetry(integration);
		const result = streamText({ model: model(), prompt: 'hi' });
		await result.consumeStream();
		expect(events.length).toBeGreaterThan(0);
	});

	it('records nothing from a full chat turn through the handler', async () => {
		const { integration, events } = recordingIntegration();
		registerTelemetry(integration);
		const site = createFakeSite({
			'/': { body: htmlPage({ title: 'Home', body: 'Home page text. '.repeat(20) }) }
		});
		const handed: Promise<unknown>[] = [];
		const handler = createChatHandler(
			{
				provider: { name: 'custom', model: 'm', instance: model() },
				origin: ORIGIN,
				waitUntil: (p) => void handed.push(p)
			},
			{ fetch: site.fetch }
		);
		const request = new Request(ORIGIN + '/api/chat', {
			method: 'POST',
			headers: { 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
			body: JSON.stringify({
				messages: [{ role: 'user', parts: [{ type: 'text', text: 'secret visitor message' }] }],
				aide: { route: '/', sessionId: 's', dom: null }
			})
		});
		const event = {
			request,
			url: new URL(request.url),
			fetch: site.fetch,
			getClientAddress: () => '203.0.113.1',
			platform: undefined
		} as unknown as RequestEvent;
		const res = await handler(event);
		expect(await res.text()).toContain('Answer.');
		await Promise.all(handed);
		expect(events).toEqual([]);
	});
});
