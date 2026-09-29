import { describe, it, expect } from 'vitest';
import { fromEnv } from '../../../src/server/from-env';
import { PROVIDERS, findProvider, loadProvider } from '../../../src/server/providers';

const TABLE = new Set([
	'SVELTE_CHAT_AIDE_PROVIDER',
	'SVELTE_CHAT_AIDE_MODEL',
	'SVELTE_CHAT_AIDE_API_KEY',
	'SVELTE_CHAT_AIDE_BASE_URL',
	'SVELTE_CHAT_AIDE_REGION',
	'SVELTE_CHAT_AIDE_PROJECT',
	'SVELTE_CHAT_AIDE_LOCATION',
	'SVELTE_CHAT_AIDE_RESOURCE_NAME',
	'SVELTE_CHAT_AIDE_OPTIONS'
]);

const DUMMY: Record<string, string> = {
	SVELTE_CHAT_AIDE_API_KEY: 'key',
	SVELTE_CHAT_AIDE_BASE_URL: 'https://llm.example.com/v1',
	SVELTE_CHAT_AIDE_REGION: 'us-east-1',
	SVELTE_CHAT_AIDE_PROJECT: 'proj',
	SVELTE_CHAT_AIDE_LOCATION: 'us-central1',
	SVELTE_CHAT_AIDE_RESOURCE_NAME: 'res'
};

/** Records every key read from the env object, by any trap. */
function recording(env: Record<string, string | undefined>) {
	const reads = new Set<string>();
	const proxy = new Proxy(env, {
		get(t, k) {
			if (typeof k === 'string') reads.add(k);
			return Reflect.get(t, k);
		},
		has(t, k) {
			if (typeof k === 'string') reads.add(k);
			return Reflect.has(t, k);
		},
		getOwnPropertyDescriptor(t, k) {
			if (typeof k === 'string') reads.add(k);
			return Reflect.getOwnPropertyDescriptor(t, k);
		},
		ownKeys() {
			throw new Error('fromEnv must not enumerate the env object');
		}
	});
	return { proxy, reads };
}

function envFor(name: string, required: string[]): Record<string, string | undefined> {
	const env: Record<string, string | undefined> = {
		SVELTE_CHAT_AIDE_PROVIDER: name,
		SVELTE_CHAT_AIDE_MODEL: 'test-model',
		ANTHROPIC_API_KEY: 'must-not-be-read',
		OPENAI_API_KEY: 'must-not-be-read',
		AWS_REGION: 'must-not-be-read'
	};
	for (const k of required) env[k] = DUMMY[k];
	return env;
}

const fromEnvRows = PROVIDERS.filter((r) => r.name !== 'custom');

describe('fromEnv', () => {
	it('every required name is in the table', () => {
		for (const row of PROVIDERS) for (const k of row.envRequired) expect(TABLE.has(k), k).toBe(true);
		expect(findProvider('anthropic')?.envRequired).toEqual(['SVELTE_CHAT_AIDE_API_KEY']);
		expect(findProvider('amazon-bedrock')?.envRequired).toEqual(['SVELTE_CHAT_AIDE_REGION']);
		expect(findProvider('google-vertex')?.envRequired).toEqual([
			'SVELTE_CHAT_AIDE_PROJECT',
			'SVELTE_CHAT_AIDE_LOCATION'
		]);
		expect(findProvider('azure')?.envRequired).toEqual([
			'SVELTE_CHAT_AIDE_API_KEY',
			'SVELTE_CHAT_AIDE_RESOURCE_NAME'
		]);
		expect(findProvider('openai-compatible')?.envRequired).toEqual(['SVELTE_CHAT_AIDE_BASE_URL']);
		expect(findProvider('ollama')?.envRequired).toEqual([]);
		expect(findProvider('lmstudio')?.envRequired).toEqual([]);
	});

	it.each(fromEnvRows.map((r) => [r.name, r] as const))(
		'%s builds from exactly its variables and reads nothing else',
		async (name, row) => {
			const { proxy, reads } = recording(envFor(name, row.envRequired));
			const cfg = fromEnv(proxy);
			expect(cfg.name).toBe(name);
			expect(cfg.model).toBe('test-model');
			const loaded = await loadProvider(cfg);
			expect(typeof loaded.model).toBe('object');
			expect(loaded.row).toBe(findProvider(name));
			for (const k of reads) {
				expect(k.startsWith('SVELTE_CHAT_AIDE_'), k).toBe(true);
				expect(TABLE.has(k), k).toBe(true);
			}
			expect(reads.has('ANTHROPIC_API_KEY')).toBe(false);
		}
	);

	it.each(
		fromEnvRows.flatMap((r) =>
			['SVELTE_CHAT_AIDE_PROVIDER', 'SVELTE_CHAT_AIDE_MODEL', ...r.envRequired].map(
				(k) => [r.name, k, r.envRequired] as const
			)
		)
	)('%s without %s throws naming it', (name, missing, required) => {
		const env = envFor(name, required);
		delete env[missing];
		expect(() => fromEnv(env)).toThrow(missing);
		env[missing] = '';
		expect(() => fromEnv(env)).toThrow(missing);
	});

	it('unknown provider throws naming the variable', () => {
		expect(() => fromEnv(envFor('nope', []))).toThrow('SVELTE_CHAT_AIDE_PROVIDER');
		expect(() => fromEnv(envFor('gateway', []))).toThrow('SVELTE_CHAT_AIDE_PROVIDER');
	});

	it('custom cannot come from the environment', () => {
		expect(() => fromEnv(envFor('custom', []))).toThrow('SVELTE_CHAT_AIDE_PROVIDER');
	});

	it('accepts an alias', () => {
		const cfg = fromEnv(envFor('gemini', ['SVELTE_CHAT_AIDE_API_KEY']));
		expect(findProvider(cfg.name)?.name).toBe('google');
	});

	it('maps every variable to its field', () => {
		const cfg = fromEnv({
			SVELTE_CHAT_AIDE_PROVIDER: 'google-vertex',
			SVELTE_CHAT_AIDE_MODEL: 'gemini-x',
			SVELTE_CHAT_AIDE_PROJECT: 'p',
			SVELTE_CHAT_AIDE_LOCATION: 'l',
			SVELTE_CHAT_AIDE_BASE_URL: 'https://proxy.example.com',
			SVELTE_CHAT_AIDE_API_KEY: 'k'
		});
		expect(cfg).toEqual({
			name: 'google-vertex',
			model: 'gemini-x',
			project: 'p',
			location: 'l',
			baseURL: 'https://proxy.example.com',
			apiKey: 'k'
		});
		expect(fromEnv(envFor('azure', ['SVELTE_CHAT_AIDE_API_KEY', 'SVELTE_CHAT_AIDE_RESOURCE_NAME']))).toMatchObject({
			resourceName: 'res'
		});
		expect(fromEnv(envFor('amazon-bedrock', ['SVELTE_CHAT_AIDE_REGION']))).toEqual({
			name: 'amazon-bedrock',
			model: 'test-model',
			region: 'us-east-1'
		});
	});

	it('azure accepts a base URL instead of a resource name', () => {
		const env = envFor('azure', ['SVELTE_CHAT_AIDE_API_KEY']);
		env.SVELTE_CHAT_AIDE_BASE_URL = 'https://res.openai.azure.com/openai';
		expect(fromEnv(env)).toMatchObject({ baseURL: 'https://res.openai.azure.com/openai' });
	});

	it('parses options as JSON', () => {
		const env = envFor('anthropic', ['SVELTE_CHAT_AIDE_API_KEY']);
		env.SVELTE_CHAT_AIDE_OPTIONS = '{"a":1}';
		expect(fromEnv(env).options).toEqual({ a: 1 });
		env.SVELTE_CHAT_AIDE_OPTIONS = '{nope';
		expect(() => fromEnv(env)).toThrow('SVELTE_CHAT_AIDE_OPTIONS');
		env.SVELTE_CHAT_AIDE_OPTIONS = '[1]';
		expect(() => fromEnv(env)).toThrow('SVELTE_CHAT_AIDE_OPTIONS');
	});

	it('never reads a provider’s conventional variable', () => {
		const { proxy, reads } = recording({
			SVELTE_CHAT_AIDE_PROVIDER: 'anthropic',
			SVELTE_CHAT_AIDE_MODEL: 'm',
			ANTHROPIC_API_KEY: 'k'
		});
		expect(() => fromEnv(proxy)).toThrow('SVELTE_CHAT_AIDE_API_KEY');
		expect(reads.has('ANTHROPIC_API_KEY')).toBe(false);
	});

	it('a value passed beside it wins', () => {
		const cfg = { ...fromEnv(envFor('anthropic', ['SVELTE_CHAT_AIDE_API_KEY'])), model: 'x' };
		expect(cfg.model).toBe('x');
	});
});
