import { describe, it, expect } from 'vitest';
import { fromEnv } from '../../../src/server/from-env';
import { PROVIDERS, findProvider, loadProvider } from '../../../src/server/providers';

const TABLE = new Set([
	'CHAT_AIDE_PROVIDER',
	'CHAT_AIDE_MODEL',
	'CHAT_AIDE_API_KEY',
	'CHAT_AIDE_BASE_URL',
	'CHAT_AIDE_REGION',
	'CHAT_AIDE_PROJECT',
	'CHAT_AIDE_LOCATION',
	'CHAT_AIDE_RESOURCE_NAME',
	'CHAT_AIDE_OPTIONS'
]);

const DUMMY: Record<string, string> = {
	CHAT_AIDE_API_KEY: 'key',
	CHAT_AIDE_BASE_URL: 'https://llm.example.com/v1',
	CHAT_AIDE_REGION: 'us-east-1',
	CHAT_AIDE_PROJECT: 'proj',
	CHAT_AIDE_LOCATION: 'us-central1',
	CHAT_AIDE_RESOURCE_NAME: 'res'
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
		CHAT_AIDE_PROVIDER: name,
		CHAT_AIDE_MODEL: 'test-model',
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
		expect(findProvider('anthropic')?.envRequired).toEqual(['CHAT_AIDE_API_KEY']);
		expect(findProvider('amazon-bedrock')?.envRequired).toEqual(['CHAT_AIDE_REGION']);
		expect(findProvider('google-vertex')?.envRequired).toEqual([
			'CHAT_AIDE_PROJECT',
			'CHAT_AIDE_LOCATION'
		]);
		expect(findProvider('azure')?.envRequired).toEqual([
			'CHAT_AIDE_API_KEY',
			'CHAT_AIDE_RESOURCE_NAME'
		]);
		expect(findProvider('openai-compatible')?.envRequired).toEqual(['CHAT_AIDE_BASE_URL']);
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
				expect(k.startsWith('CHAT_AIDE_'), k).toBe(true);
				expect(TABLE.has(k), k).toBe(true);
			}
			expect(reads.has('ANTHROPIC_API_KEY')).toBe(false);
		}
	);

	it.each(
		fromEnvRows.flatMap((r) =>
			['CHAT_AIDE_PROVIDER', 'CHAT_AIDE_MODEL', ...r.envRequired].map(
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
		expect(() => fromEnv(envFor('nope', []))).toThrow('CHAT_AIDE_PROVIDER');
		expect(() => fromEnv(envFor('gateway', []))).toThrow('CHAT_AIDE_PROVIDER');
	});

	it('custom cannot come from the environment', () => {
		expect(() => fromEnv(envFor('custom', []))).toThrow('CHAT_AIDE_PROVIDER');
	});

	it('accepts an alias', () => {
		const cfg = fromEnv(envFor('gemini', ['CHAT_AIDE_API_KEY']));
		expect(findProvider(cfg.name)?.name).toBe('google');
	});

	it('maps every variable to its field', () => {
		const cfg = fromEnv({
			CHAT_AIDE_PROVIDER: 'google-vertex',
			CHAT_AIDE_MODEL: 'gemini-x',
			CHAT_AIDE_PROJECT: 'p',
			CHAT_AIDE_LOCATION: 'l',
			CHAT_AIDE_BASE_URL: 'https://proxy.example.com',
			CHAT_AIDE_API_KEY: 'k'
		});
		expect(cfg).toEqual({
			name: 'google-vertex',
			model: 'gemini-x',
			project: 'p',
			location: 'l',
			baseURL: 'https://proxy.example.com',
			apiKey: 'k'
		});
		expect(fromEnv(envFor('azure', ['CHAT_AIDE_API_KEY', 'CHAT_AIDE_RESOURCE_NAME']))).toMatchObject({
			resourceName: 'res'
		});
		expect(fromEnv(envFor('amazon-bedrock', ['CHAT_AIDE_REGION']))).toEqual({
			name: 'amazon-bedrock',
			model: 'test-model',
			region: 'us-east-1'
		});
	});

	it('azure accepts a base URL instead of a resource name', () => {
		const env = envFor('azure', ['CHAT_AIDE_API_KEY']);
		env.CHAT_AIDE_BASE_URL = 'https://res.openai.azure.com/openai';
		expect(fromEnv(env)).toMatchObject({ baseURL: 'https://res.openai.azure.com/openai' });
	});

	it('parses options as JSON', () => {
		const env = envFor('anthropic', ['CHAT_AIDE_API_KEY']);
		env.CHAT_AIDE_OPTIONS = '{"a":1}';
		expect(fromEnv(env).options).toEqual({ a: 1 });
		env.CHAT_AIDE_OPTIONS = '{nope';
		expect(() => fromEnv(env)).toThrow('CHAT_AIDE_OPTIONS');
		env.CHAT_AIDE_OPTIONS = '[1]';
		expect(() => fromEnv(env)).toThrow('CHAT_AIDE_OPTIONS');
	});

	it('never reads a provider’s conventional variable', () => {
		const { proxy, reads } = recording({
			CHAT_AIDE_PROVIDER: 'anthropic',
			CHAT_AIDE_MODEL: 'm',
			ANTHROPIC_API_KEY: 'k'
		});
		expect(() => fromEnv(proxy)).toThrow('CHAT_AIDE_API_KEY');
		expect(reads.has('ANTHROPIC_API_KEY')).toBe(false);
	});

	it('a value passed beside it wins', () => {
		const cfg = { ...fromEnv(envFor('anthropic', ['CHAT_AIDE_API_KEY'])), model: 'x' };
		expect(cfg.model).toBe('x');
	});
});
