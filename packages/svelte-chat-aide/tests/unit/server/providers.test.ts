import { describe, it, expect } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import {
	PROVIDERS,
	findProvider,
	loadProvider,
	type ProviderRow
} from '../../../src/lib/server/providers';
import type { ProviderConfig } from '../../../src/lib/shared/types';

/** Dummy credentials for a row, enough for its factory to build a model object. */
function dummyConfig(row: ProviderRow): ProviderConfig {
	const cfg: ProviderConfig = { name: row.name, model: 'test-model', apiKey: 'test-key' };
	switch (row.credentials) {
		case 'azure':
			cfg.resourceName = 'test-resource';
			break;
		case 'vertex':
			cfg.project = 'test-project';
			cfg.location = 'us-central1';
			delete cfg.apiKey;
			break;
		case 'bedrock':
			cfg.region = 'us-east-1';
			cfg.accessKeyId = 'AKIDTEST';
			cfg.secretAccessKey = 'secret';
			delete cfg.apiKey;
			break;
		case 'openai-compatible':
			cfg.baseURL = 'https://llm.example.com/v1';
			break;
		case 'custom':
			cfg.instance = new MockLanguageModelV4();
			delete cfg.apiKey;
			break;
		case 'none':
			delete cfg.apiKey;
			break;
	}
	return cfg;
}

const OFFICIAL = [
	'anthropic',
	'openai',
	'azure',
	'google',
	'google-vertex',
	'amazon-bedrock',
	'mistral',
	'xai',
	'groq',
	'deepseek',
	'cohere',
	'togetherai',
	'fireworks',
	'deepinfra',
	'cerebras',
	'perplexity',
	'baseten',
	'huggingface'
];
const COMMUNITY = ['openrouter', 'kimi', 'ollama', 'lmstudio', 'nvidia-nim', 'openai-compatible', 'custom'];

describe('provider registry', () => {
	it('has exactly the rows of both spec tables', () => {
		expect(PROVIDERS.map((r) => r.name).sort()).toEqual([...OFFICIAL, ...COMMUNITY].sort());
	});

	// 1 + 5
	it.each(PROVIDERS.map((r) => [r.name, r] as const))(
		'%s loads a model object, never a string',
		async (_name, row) => {
			const loaded = await loadProvider(dummyConfig(row));
			const model = loaded.model as unknown;
			expect(typeof model).toBe('object');
			expect(typeof (model as { provider: unknown }).provider).toBe('string');
			expect(loaded.row).toBe(row);
			expect(loaded.providerName).toBe((model as { provider: string }).provider);
			expect(loaded.modelId).toBe(row.name === 'custom' ? 'mock-model-id' : 'test-model');
			expect((globalThis as Record<string, unknown>).AI_SDK_DEFAULT_PROVIDER).toBeUndefined();
		}
	);

	it('presets point at their endpoint and keyless presets need no key', async () => {
		const kimi = findProvider('kimi');
		expect(kimi?.preset?.baseURL).toBe('https://api.moonshot.ai/v1');
		expect(findProvider('ollama')?.preset).toMatchObject({ baseURL: 'http://localhost:11434/v1', keyless: true });
		expect(findProvider('lmstudio')?.preset).toMatchObject({ baseURL: 'http://localhost:1234/v1', keyless: true });
		expect(findProvider('nvidia-nim')?.preset?.baseURL).toBe('https://integrate.api.nvidia.com/v1');
		const m = await loadProvider({ name: 'ollama', model: 'llama3' });
		expect(m.modelId).toBe('llama3');
	});

	it('openai-compatible requires a baseURL', async () => {
		await expect(loadProvider({ name: 'openai-compatible', model: 'm' })).rejects.toThrow(/baseURL/);
	});

	it('custom refuses anything but a model object', async () => {
		await expect(loadProvider({ name: 'custom', model: 'm' })).rejects.toThrow(/instance/);
		await expect(
			loadProvider({ name: 'custom', model: 'm', instance: 'anthropic/x' as never })
		).rejects.toThrow(/instance/);
	});

	it('resolves aliases', () => {
		expect(findProvider('gemini')?.name).toBe('google');
		expect(findProvider('moonshot')?.name).toBe('kimi');
		expect(findProvider('nope')).toBeUndefined();
	});

	// 2
	it('has no gateway row', () => {
		for (const row of PROVIDERS) {
			for (const s of [row.name, row.pkg, ...(row.aliases ?? [])]) expect(s).not.toMatch(/gateway/i);
		}
		expect(findProvider('gateway')).toBeUndefined();
	});

	it('refuses an unknown name', async () => {
		await expect(loadProvider({ name: 'gateway', model: 'm' })).rejects.toThrow(/gateway/);
	});

	// 3
	it('a missing adapter throws the pnpm add line', async () => {
		const importer = async (pkg: string): Promise<Record<string, unknown>> => {
			const err = new Error(`Cannot find package '${pkg}'`) as Error & { code: string };
			err.code = 'ERR_MODULE_NOT_FOUND';
			throw err;
		};
		await expect(
			loadProvider({ name: 'anthropic', model: 'm', apiKey: 'k' }, importer)
		).rejects.toThrow('pnpm add @ai-sdk/anthropic');
	});

	it('rethrows other import errors unchanged', async () => {
		const boom = new Error('boom');
		await expect(
			loadProvider({ name: 'anthropic', model: 'm' }, async () => {
				throw boom;
			})
		).rejects.toBe(boom);
	});

	it('passes credentials, options and routing to the factory', async () => {
		const calls: { settings: Record<string, unknown>; args: unknown[] }[] = [];
		const importer = async (): Promise<Record<string, unknown>> => {
			const factory = (settings: Record<string, unknown>) => {
				const provider = (...args: unknown[]) => {
					calls.push({ settings, args });
					return { provider: 'fake', modelId: args[0] };
				};
				return provider;
			};
			return { createAnthropic: factory, createOpenRouter: factory, createAmazonBedrock: factory };
		};
		await loadProvider(
			{ name: 'anthropic', model: 'm', apiKey: 'k', headers: { a: 'b' }, options: { x: 1 } },
			importer
		);
		expect(calls[0]!.settings).toEqual({ apiKey: 'k', headers: { a: 'b' }, x: 1 });
		await loadProvider({ name: 'amazon-bedrock', model: 'm', region: 'eu-west-1' }, importer);
		expect(calls[1]!.settings).toEqual({ region: 'eu-west-1' });
		await loadProvider(
			{ name: 'openrouter', model: 'm', apiKey: 'k', routing: { data_collection: 'deny' } },
			importer
		);
		expect(calls[2]!.args).toEqual(['m', { provider: { data_collection: 'deny' } }]);
	});

	// 4
	it('marks caching per row', () => {
		for (const row of PROVIDERS) {
			const expected = row.name === 'anthropic' ? 'anthropic' : row.name === 'amazon-bedrock' ? 'bedrock' : 'none';
			expect(row.cache, row.name).toBe(expected);
		}
	});
});
