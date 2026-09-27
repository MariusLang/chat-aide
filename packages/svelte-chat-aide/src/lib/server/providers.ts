import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '../shared/types.js';

/** Which prompt-caching marker the static prefix needs (spec §3.2, §3.5). */
export type CacheMarker = 'anthropic' | 'bedrock' | 'none';

export interface ProviderRow {
	name: string;
	aliases?: string[];
	/** Adapter package, installed by the developer. */
	pkg: string;
	/** Factory export of `pkg`, e.g. `createAnthropic`. */
	factory: string;
	/**
	 * The adapter's own default endpoint, passed explicitly when the developer gives no
	 * `baseURL`: some adapters otherwise read one from the environment (`ANTHROPIC_BASE_URL`,
	 * `OPENAI_BASE_URL`), which could send the key somewhere else.
	 */
	defaultBaseURL?: string;
	/** For `@ai-sdk/openai-compatible` presets. */
	preset?: { baseURL: string; keyless?: boolean; providerName: string };
	credentials: 'apiKey' | 'none' | 'azure' | 'vertex' | 'bedrock' | 'openai-compatible' | 'custom';
	/** `SVELTE_CHAT_AIDE_*` variables `fromEnv` requires for this row. */
	envRequired: string[];
	cache: CacheMarker;
}

const API_KEY = 'SVELTE_CHAT_AIDE_API_KEY';

function keyed(
	name: string,
	pkg: string,
	factory: string,
	defaultBaseURL: string,
	extra: Partial<ProviderRow> = {}
): ProviderRow {
	return {
		name,
		pkg,
		factory,
		defaultBaseURL,
		credentials: 'apiKey',
		envRequired: [API_KEY],
		cache: 'none',
		...extra
	};
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
	// Default endpoints are copied from each adapter's source.
	keyed('anthropic', '@ai-sdk/anthropic', 'createAnthropic', 'https://api.anthropic.com/v1', {
		cache: 'anthropic'
	}),
	keyed('openai', '@ai-sdk/openai', 'createOpenAI', 'https://api.openai.com/v1'),
	{
		name: 'azure',
		pkg: '@ai-sdk/azure',
		factory: 'createAzure',
		cache: 'none',
		credentials: 'azure',
		envRequired: [API_KEY, 'SVELTE_CHAT_AIDE_RESOURCE_NAME']
	},
	keyed('google', '@ai-sdk/google', 'createGoogle', 'https://generativelanguage.googleapis.com/v1beta', {
		aliases: ['gemini']
	}),
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
	keyed('mistral', '@ai-sdk/mistral', 'createMistral', 'https://api.mistral.ai/v1'),
	keyed('xai', '@ai-sdk/xai', 'createXai', 'https://api.x.ai/v1'),
	keyed('groq', '@ai-sdk/groq', 'createGroq', 'https://api.groq.com/openai/v1'),
	keyed('deepseek', '@ai-sdk/deepseek', 'createDeepSeek', 'https://api.deepseek.com'),
	keyed('cohere', '@ai-sdk/cohere', 'createCohere', 'https://api.cohere.com/v2'),
	keyed('togetherai', '@ai-sdk/togetherai', 'createTogetherAI', 'https://api.together.xyz/v1/'),
	keyed('fireworks', '@ai-sdk/fireworks', 'createFireworks', 'https://api.fireworks.ai/inference/v1'),
	keyed('deepinfra', '@ai-sdk/deepinfra', 'createDeepInfra', 'https://api.deepinfra.com/v1'),
	keyed('cerebras', '@ai-sdk/cerebras', 'createCerebras', 'https://api.cerebras.ai/v1'),
	keyed('perplexity', '@ai-sdk/perplexity', 'createPerplexity', 'https://api.perplexity.ai'),
	keyed('baseten', '@ai-sdk/baseten', 'createBaseten', 'https://inference.baseten.co/v1'),
	keyed('huggingface', '@ai-sdk/huggingface', 'createHuggingFace', 'https://router.huggingface.co/v1'),
	// Community and compatible
	keyed('openrouter', '@openrouter/ai-sdk-provider', 'createOpenRouter', 'https://openrouter.ai/api/v1'),
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

// AWS partitions whose endpoints are not under amazonaws.com (from @ai-sdk/amazon-bedrock).
const AWS_DNS_SUFFIXES: [prefix: string, suffix: string][] = [
	['cn-', 'amazonaws.com.cn'],
	['us-iso-', 'c2s.ic.gov'],
	['us-isob-', 'sc2s.sgov.gov'],
	['eu-isoe-', 'cloud.adc-e.uk'],
	['us-isof-', 'csp.hci.ic.gov'],
	['eusc-', 'amazonaws.eu']
];

const CLOUD_ID = /^[a-z0-9][a-z0-9-]*$/;

function bedrockBaseURL(region: string): string {
	const suffix = AWS_DNS_SUFFIXES.find(([p]) => region.startsWith(p))?.[1] ?? 'amazonaws.com';
	return `https://bedrock-runtime.${region}.${suffix}`;
}

/**
 * Every endpoint-shaping setting is given explicitly, so no adapter falls back to an
 * environment variable (`ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, `AZURE_RESOURCE_NAME`,
 * `AWS_ENDPOINT_URL*`, `AWS_REGION`, `GOOGLE_VERTEX_PROJECT`/`_LOCATION`).
 */
function requireEndpoint(row: ProviderRow, cfg: ProviderConfig): void {
	const need = (what: string) =>
		new Error(`svelte-chat-aide: provider "${row.name}" needs ${what}.`);
	switch (row.credentials) {
		case 'azure':
			if (!cfg.resourceName && !cfg.baseURL) throw need('provider.resourceName or provider.baseURL');
			break;
		case 'bedrock':
			if (!cfg.region) throw need('provider.region');
			if (!cfg.baseURL && !CLOUD_ID.test(cfg.region)) throw need('a valid provider.region');
			break;
		case 'vertex':
			if (!cfg.project) throw need('provider.project');
			if (!cfg.location) throw need('provider.location');
			if (!CLOUD_ID.test(cfg.location)) throw need('a valid provider.location');
			break;
	}
}

function settingsFor(row: ProviderRow, cfg: ProviderConfig): Record<string, unknown> {
	const base: Record<string, unknown> = {
		apiKey: cfg.apiKey,
		baseURL: cfg.baseURL ?? row.defaultBaseURL,
		headers: cfg.headers
	};
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
			if (!cfg.baseURL && cfg.region) base.baseURL = bedrockBaseURL(cfg.region);
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
	requireEndpoint(row, cfg);

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
