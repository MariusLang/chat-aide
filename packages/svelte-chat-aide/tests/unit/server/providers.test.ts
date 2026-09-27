import { afterEach, beforeEach, describe, it, expect } from 'vitest';
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
		expect(calls[0]!.settings).toEqual({
			apiKey: 'k',
			baseURL: 'https://api.anthropic.com/v1',
			headers: { a: 'b' },
			x: 1
		});
		await loadProvider({ name: 'amazon-bedrock', model: 'm', region: 'eu-west-1' }, importer);
		expect(calls[1]!.settings).toEqual({
			region: 'eu-west-1',
			baseURL: 'https://bedrock-runtime.eu-west-1.amazonaws.com'
		});
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

describe('adapters never read an endpoint from the environment', () => {
	const TRAP = 'trap.invalid';
	/** Every endpoint-shaping variable an adapter reads when its setting is unset. */
	const VARS = [
		'ANTHROPIC_BASE_URL',
		'OPENAI_BASE_URL',
		'AZURE_RESOURCE_NAME',
		'AWS_ENDPOINT_URL',
		'AWS_ENDPOINT_URL_BEDROCK_RUNTIME',
		'AWS_REGION',
		'GOOGLE_VERTEX_PROJECT',
		'GOOGLE_VERTEX_LOCATION'
	];
	const saved: Record<string, string | undefined> = {};
	beforeEach(() => {
		for (const v of VARS) {
			saved[v] = process.env[v];
			process.env[v] = v.endsWith('URL') ? `https://${TRAP}/v1` : TRAP;
		}
	});
	afterEach(() => {
		for (const v of VARS) {
			if (saved[v] === undefined) delete process.env[v];
			else process.env[v] = saved[v];
		}
	});

	const rows = PROVIDERS.filter((r) => r.credentials !== 'custom');
	it.each(rows.map((r) => [r.name, r] as const))('%s sends to its own endpoint', async (_n, row) => {
		const urls: string[] = [];
		const trapFetch = (async (input: RequestInfo | URL) => {
			urls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
			return new Response('{}', { status: 500 });
		}) as typeof fetch;
		const cfg = dummyConfig(row);
		cfg.options = { fetch: trapFetch };
		const { model } = await loadProvider(cfg);
		const m = model as unknown as {
			config?: unknown;
			doGenerate(o: unknown): Promise<unknown>;
		};
		try {
			await m.doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] });
		} catch {
			// The 500 (or missing cloud credentials) is expected; only the URL matters.
		}
		for (const url of urls) expect(url).not.toContain(TRAP);
		expect(JSON.stringify(m.config ?? {})).not.toContain(TRAP);
		if (row.credentials !== 'vertex') expect(urls.length).toBeGreaterThan(0);
	});

	it('azure requires resourceName or baseURL', async () => {
		await expect(loadProvider({ name: 'azure', model: 'm', apiKey: 'k' })).rejects.toThrow(
			/resourceName/
		);
		await expect(
			loadProvider({ name: 'azure', model: 'm', apiKey: 'k', baseURL: 'https://x.openai.azure.com/openai' })
		).resolves.toBeTruthy();
	});

	it('amazon-bedrock requires a region', async () => {
		await expect(
			loadProvider({ name: 'amazon-bedrock', model: 'm', accessKeyId: 'a', secretAccessKey: 's' })
		).rejects.toThrow(/region/);
	});

	it('google-vertex requires project and location', async () => {
		await expect(loadProvider({ name: 'google-vertex', model: 'm', project: 'p' })).rejects.toThrow(
			/location/
		);
		await expect(loadProvider({ name: 'google-vertex', model: 'm', location: 'us-central1' })).rejects.toThrow(
			/project/
		);
	});

	it('every keyed official row names its default endpoint', () => {
		for (const row of PROVIDERS) {
			if (row.credentials === 'apiKey' && !row.preset) expect(row.defaultBaseURL, row.name).toMatch(/^https:\/\//);
		}
	});
});

describe('installation', () => {
	it('installs ai and every registry adapter with the package, so one pnpm add is enough', async () => {
		const { readFileSync } = await import('node:fs');
		const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as {
			dependencies: Record<string, string>;
			peerDependencies: Record<string, string>;
		};
		const needed = ['ai', ...new Set(PROVIDERS.map((row) => row.pkg).filter(Boolean))];
		for (const name of needed) {
			expect(pkg.dependencies, name).toHaveProperty(name);
			expect(pkg.peerDependencies, name).not.toHaveProperty(name);
		}
	});
});
