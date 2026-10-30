import type { ProviderConfig } from '../shared/types.js';
import { findProvider } from './providers.js';

const PREFIX = 'SVELTE_CHAT_AIDE_';
const V = {
	provider: `${PREFIX}PROVIDER`,
	model: `${PREFIX}MODEL`,
	apiKey: `${PREFIX}API_KEY`,
	baseURL: `${PREFIX}BASE_URL`,
	region: `${PREFIX}REGION`,
	project: `${PREFIX}PROJECT`,
	location: `${PREFIX}LOCATION`,
	resourceName: `${PREFIX}RESOURCE_NAME`,
	options: `${PREFIX}OPTIONS`
} as const;

class FromEnvError extends Error {
	constructor(message: string) {
		super(`chat-aide fromEnv: ${message}`);
		this.name = 'FromEnvError';
	}
}

/**
 * Builds a `ProviderConfig` from the environment object handed in (spec §3.2).
 * Reads only the `SVELTE_CHAT_AIDE_*` variables of the table, and nothing from the process.
 */
export function fromEnv(env: Record<string, string | undefined>): ProviderConfig {
	const read = (name: string): string | undefined => {
		const value = env[name];
		return typeof value === 'string' && value !== '' ? value : undefined;
	};
	const need = (name: string, why: string): string => {
		const value = read(name);
		if (value === undefined) throw new FromEnvError(`${name} is required ${why}.`);
		return value;
	};

	const name = need(V.provider, 'to choose the provider');
	const row = findProvider(name);
	if (!row) throw new FromEnvError(`${V.provider}="${name}" is not a supported provider.`);
	if (row.credentials === 'custom') {
		throw new FromEnvError(
			`${V.provider}="custom" needs a model instance constructed in code; pass { name: 'custom', instance } instead.`
		);
	}
	const model = need(V.model, 'to choose the model');

	const cfg: ProviderConfig = { name, model };
	const set = <K extends keyof ProviderConfig>(key: K, value: ProviderConfig[K] | undefined) => {
		if (value !== undefined) cfg[key] = value;
	};

	const baseURL = read(V.baseURL);
	for (const variable of row.envRequired) {
		// Azure takes a base URL in place of a resource name.
		if (variable === V.resourceName && baseURL !== undefined) continue;
		need(variable, `for provider "${row.name}"`);
	}

	set('apiKey', read(V.apiKey));
	set('baseURL', baseURL);
	if (row.credentials === 'bedrock') set('region', read(V.region));
	if (row.credentials === 'vertex') {
		set('project', read(V.project));
		set('location', read(V.location));
	}
	if (row.credentials === 'azure') set('resourceName', read(V.resourceName));

	const rawOptions = read(V.options);
	if (rawOptions !== undefined) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(rawOptions);
		} catch {
			throw new FromEnvError(`${V.options} is not valid JSON.`);
		}
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			throw new FromEnvError(`${V.options} must be a JSON object.`);
		}
		cfg.options = parsed as Record<string, unknown>;
	}
	return cfg;
}
