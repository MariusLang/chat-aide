import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '../shared/types';

/** Which prompt-caching marker the static prefix needs (spec §3.2, §3.5). */
export type CacheMarker = 'anthropic' | 'bedrock' | 'none';

export interface ProviderRow {
	name: string;
	aliases?: string[];
	/** Adapter package, installed by the developer. */
	pkg: string;
	/** Factory export of `pkg`, e.g. `createAnthropic`. */
	factory: string;
	/** For `@ai-sdk/openai-compatible` presets. */
	preset?: { baseURL: string; keyless?: boolean; providerName: string };
	credentials: 'apiKey' | 'none' | 'azure' | 'vertex' | 'bedrock' | 'openai-compatible' | 'custom';
	/** `SVELTE_CHAT_AIDE_*` variables `fromEnv` requires for this row. */
	envRequired: string[];
	cache: CacheMarker;
}

const API_KEY = 'SVELTE_CHAT_AIDE_API_KEY';

function keyed(name: string, pkg: string, factory: string, extra: Partial<ProviderRow> = {}): ProviderRow {
	return { name, pkg, factory, credentials: 'apiKey', envRequired: [API_KEY], cache: 'none', ...extra };
}

function preset(
	name: string,
	baseURL: string,
	keyless: boolean,
	extra: Partial<ProviderRow> = {}
): ProviderRow {
	return {
		name,
		pkg: '@ai-sdk/openai-compatible',
		factory: 'createOpenAICompatible',
		preset: { baseURL, providerName: name, ...(keyless ? { keyless } : {}) },
		credentials: keyless ? 'none' : 'apiKey',
		envRequired: keyless ? [] : [API_KEY],
		cache: 'none',
		...extra
	};
}

/** Every language-model provider the library names: both tables of spec §3.2. */
export const PROVIDERS: readonly ProviderRow[] = Object.freeze([
	// Official adapters
	keyed('anthropic', '@ai-sdk/anthropic', 'createAnthropic', { cache: 'anthropic' }),
	keyed('openai', '@ai-sdk/openai', 'createOpenAI'),
	keyed('azure', '@ai-sdk/azure', 'createAzure', {
		credentials: 'azure',
		envRequired: [API_KEY, 'SVELTE_CHAT_AIDE_RESOURCE_NAME']
	}),
	keyed('google', '@ai-sdk/google', 'createGoogle', { aliases: ['gemini'] }),
	{
		name: 'google-vertex',
		pkg: '@ai-sdk/google-vertex',
		factory: 'createGoogleVertex',
		credentials: 'vertex',
		envRequired: ['SVELTE_CHAT_AIDE_PROJECT', 'SVELTE_CHAT_AIDE_LOCATION'],
		cache: 'none'
	},
	{
		name: 'amazon-bedrock',
		pkg: '@ai-sdk/amazon-bedrock',
		factory: 'createAmazonBedrock',
		credentials: 'bedrock',
		envRequired: ['SVELTE_CHAT_AIDE_REGION'],
		cache: 'bedrock'
	},
	keyed('mistral', '@ai-sdk/mistral', 'createMistral'),
	keyed('xai', '@ai-sdk/xai', 'createXai'),
	keyed('groq', '@ai-sdk/groq', 'createGroq'),
	keyed('deepseek', '@ai-sdk/deepseek', 'createDeepSeek'),
	keyed('cohere', '@ai-sdk/cohere', 'createCohere'),
	keyed('togetherai', '@ai-sdk/togetherai', 'createTogetherAI'),
	keyed('fireworks', '@ai-sdk/fireworks', 'createFireworks'),
	keyed('deepinfra', '@ai-sdk/deepinfra', 'createDeepInfra'),
	keyed('cerebras', '@ai-sdk/cerebras', 'createCerebras'),
	keyed('perplexity', '@ai-sdk/perplexity', 'createPerplexity'),
	keyed('baseten', '@ai-sdk/baseten', 'createBaseten'),
	keyed('huggingface', '@ai-sdk/huggingface', 'createHuggingFace'),
	// Community and compatible
	keyed('openrouter', '@openrouter/ai-sdk-provider', 'createOpenRouter'),
	preset('kimi', 'https://api.moonshot.ai/v1', false, { aliases: ['moonshot'] }),
	preset('ollama', 'http://localhost:11434/v1', true),
	preset('lmstudio', 'http://localhost:1234/v1', true),
	preset('nvidia-nim', 'https://integrate.api.nvidia.com/v1', false),
	{
		name: 'openai-compatible',
		pkg: '@ai-sdk/openai-compatible',
		factory: 'createOpenAICompatible',
		credentials: 'openai-compatible',
		envRequired: ['SVELTE_CHAT_AIDE_BASE_URL'],
		cache: 'none'
	},
	{ name: 'custom', pkg: '', factory: '', credentials: 'custom', envRequired: [], cache: 'none' }
] satisfies ProviderRow[]);

/** Looks a provider up by name or alias (`gemini` -> `google`, `moonshot` -> `kimi`). */
export function findProvider(name: string): ProviderRow | undefined {
	const n = name.trim().toLowerCase();
	return PROVIDERS.find((r) => r.name === n || r.aliases?.includes(n));
}

export type LanguageModelObject = Exclude<LanguageModel, string>;

export interface LoadedProvider {
	row: ProviderRow;
	/** Always a model object with a `provider` field; never a model-id string. */
	model: LanguageModelObject;
	providerName: string;
	modelId: string;
}

export type Importer = (pkg: string) => Promise<Record<string, unknown>>;

const defaultImporter: Importer = (pkg) => import(/* @vite-ignore */ pkg);

function isModuleNotFound(err: unknown): boolean {
	if (!err || typeof err !== 'object') return false;
	const code = (err as { code?: unknown }).code;
	if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') return true;
	const message = (err as { message?: unknown }).message;
	return typeof message === 'string' && /Cannot find (package|module)|Failed to (resolve|load)/i.test(message);
}

function isModelObject(value: unknown): value is LanguageModelObject {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { provider?: unknown }).provider === 'string' &&
		typeof (value as { modelId?: unknown }).modelId === 'string'
	);
}

/** Copies only the defined entries, so adapters fall back to their own defaults for the rest. */
function defined(entries: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(entries)) if (v !== undefined) out[k] = v;
	return out;
}

function settingsFor(row: ProviderRow, cfg: ProviderConfig): Record<string, unknown> {
	const base: Record<string, unknown> = { apiKey: cfg.apiKey, baseURL: cfg.baseURL, headers: cfg.headers };
	switch (row.credentials) {
		case 'azure':
			Object.assign(base, { resourceName: cfg.resourceName, apiVersion: cfg.apiVersion });
			break;
		case 'vertex':
			Object.assign(base, {
				project: cfg.project,
				location: cfg.location,
				googleAuthOptions: cfg.credentials !== undefined ? { credentials: cfg.credentials } : undefined
			});
			break;
		case 'bedrock':
			Object.assign(base, {
				region: cfg.region,
				accessKeyId: cfg.accessKeyId,
				secretAccessKey: cfg.secretAccessKey,
				sessionToken: cfg.sessionToken
			});
			break;
	}
	if (row.preset) {
		base.name = row.preset.providerName;
		base.baseURL = cfg.baseURL ?? row.preset.baseURL;
	} else if (row.credentials === 'openai-compatible') {
		base.name = row.name;
	}
	return defined({ ...base, ...cfg.options });
}

/**
 * Builds the model object for `cfg` by dynamically importing the row's adapter.
 * Throws when the name is not a row, or with the `pnpm add` line when the adapter is missing.
 */
export async function loadProvider(
	cfg: ProviderConfig,
	importer: Importer = defaultImporter
): Promise<LoadedProvider> {
	const row = findProvider(cfg.name);
	if (!row) {
		throw new Error(
			`svelte-chat-aide: provider.name "${cfg.name}" is not a supported provider. ` +
				`Use one of: ${PROVIDERS.map((r) => r.name).join(', ')}.`
		);
	}

	if (row.credentials === 'custom') {
		const instance: unknown = cfg.instance;
		if (!isModelObject(instance)) {
			throw new Error(
				'svelte-chat-aide: provider "custom" needs provider.instance, a LanguageModel object ' +
					'with `provider` and `modelId` (never a model-id string).'
			);
		}
		return { row, model: instance, providerName: instance.provider, modelId: instance.modelId };
	}

	if (row.credentials === 'openai-compatible' && !cfg.baseURL) {
		throw new Error('svelte-chat-aide: provider "openai-compatible" needs provider.baseURL.');
	}

	let mod: Record<string, unknown>;
	try {
		mod = await importer(row.pkg);
	} catch (err) {
		if (isModuleNotFound(err)) {
			throw new Error(
				`svelte-chat-aide: provider "${row.name}" needs its adapter ${row.pkg}, which is not installed. ` +
					`Run: pnpm add ${row.pkg}`,
				{ cause: err }
			);
		}
		throw err;
	}

	const factory = mod[row.factory];
	if (typeof factory !== 'function') {
		throw new Error(`svelte-chat-aide: ${row.pkg} does not export ${row.factory}; check its version.`);
	}
	const provider = factory(settingsFor(row, cfg)) as Record<string, unknown> &
		((modelId: string, settings?: unknown) => unknown);

	let model: unknown;
	if (row.pkg === '@ai-sdk/openai-compatible') {
		model = (provider.chatModel as (id: string) => unknown)(cfg.model);
	} else if (row.name === 'openrouter' && cfg.routing) {
		model = provider(cfg.model, { provider: cfg.routing });
	} else {
		model = provider(cfg.model);
	}

	if (!isModelObject(model)) {
		throw new Error(`svelte-chat-aide: ${row.pkg} did not return a model object for "${cfg.model}".`);
	}
	return { row, model, providerName: model.provider, modelId: model.modelId };
}
