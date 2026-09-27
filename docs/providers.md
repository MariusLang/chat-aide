# Providers

`provider.name` is one row of the registry below. Every adapter package is a dependency of
`svelte-chat-aide`, installed with it; the one you name is loaded with a dynamic `import()` when
the handler is created, and the others are never loaded. Should an adapter be missing anyway (a
pruned install), `handle.handler.ready` and the first request reject with the exact `pnpm add`
line.

```ts
provider: {
	name: 'anthropic',
	model: 'claude-haiku-4-5',  // required; there is no default model
	apiKey: '…',
	baseURL?: '…',             // proxies, EU endpoints, self-hosted servers
	headers?: { … },
	options?: { … }            // passed to the adapter's create* factory untouched
}
```

## Rules

- **The library reads no environment variable.** Every credential is a value you pass. Since an
  adapter given no `apiKey` would read its own variable (`ANTHROPIC_API_KEY`, …), every
  key-based row **requires `apiKey`**: handler creation throws `provider.apiKey: is required…`
  otherwise. Pass the key explicitly, or use [`fromEnv`](#fromenv).
- **No environment variable can redirect the key.** When you give no `baseURL`, each key-based
  row passes its adapter's default endpoint explicitly, so `ANTHROPIC_BASE_URL`,
  `OPENAI_BASE_URL` and the like are never consulted. Bedrock's endpoint is built from
  `region`; Azure requires `resourceName` or `baseURL`; Vertex requires `project` and
  `location`; the presets pass their fixed URL.
- **Only model objects reach the AI SDK**, never a model-id string (in AI SDK 7 a bare string is
  a request to Vercel's AI Gateway). The library never reads or sets
  `globalThis.AI_SDK_DEFAULT_PROVIDER`.
- **Vercel AI Gateway is not supported.** A `provider.name` containing `gateway` is refused by the
  config schema, and so is a `custom` instance whose provider is a gateway model.
- The widget's disclosure line names the provider (its display name, e.g. "Anthropic",
  "Amazon Bedrock"; for `openai-compatible` the `baseURL`'s host; for `custom` the instance's
  `provider`), learned from the warm-up.

## Official adapters

| `name` | adapter package | credentials | default endpoint passed |
|---|---|---|---|
| `anthropic` | `@ai-sdk/anthropic` | `apiKey` (required) | `https://api.anthropic.com/v1` |
| `openai` | `@ai-sdk/openai` | `apiKey` (required) | `https://api.openai.com/v1` |
| `azure` | `@ai-sdk/azure` | `apiKey` (required), `resourceName` or `baseURL` (required), `apiVersion` | from `resourceName` |
| `google` (alias `gemini`) | `@ai-sdk/google` | `apiKey` (required) | `https://generativelanguage.googleapis.com/v1beta` |
| `google-vertex` | `@ai-sdk/google-vertex` | `project`, `location` (required); `credentials` (service-account JSON) or Application Default Credentials | from `project`/`location` |
| `amazon-bedrock` | `@ai-sdk/amazon-bedrock` | `region` (required); `accessKeyId`, `secretAccessKey`, `sessionToken`, or the AWS default chain | `https://bedrock-runtime.<region>.<partition suffix>` |
| `mistral` | `@ai-sdk/mistral` | `apiKey` (required) | `https://api.mistral.ai/v1` |
| `xai` | `@ai-sdk/xai` | `apiKey` (required) | `https://api.x.ai/v1` |
| `groq` | `@ai-sdk/groq` | `apiKey` (required) | `https://api.groq.com/openai/v1` |
| `deepseek` | `@ai-sdk/deepseek` | `apiKey` (required) | `https://api.deepseek.com` |
| `cohere` | `@ai-sdk/cohere` | `apiKey` (required) | `https://api.cohere.com/v2` |
| `togetherai` | `@ai-sdk/togetherai` | `apiKey` (required) | `https://api.together.xyz/v1/` |
| `fireworks` | `@ai-sdk/fireworks` | `apiKey` (required) | `https://api.fireworks.ai/inference/v1` |
| `deepinfra` | `@ai-sdk/deepinfra` | `apiKey` (required) | `https://api.deepinfra.com/v1` |
| `cerebras` | `@ai-sdk/cerebras` | `apiKey` (required) | `https://api.cerebras.ai/v1` |
| `perplexity` | `@ai-sdk/perplexity` | `apiKey` (required) | `https://api.perplexity.ai` |
| `baseten` | `@ai-sdk/baseten` | `apiKey` (required) | `https://inference.baseten.co/v1` |
| `huggingface` | `@ai-sdk/huggingface` | `apiKey` (required) | `https://router.huggingface.co/v1` |

## Community and compatible

| `name` | adapter package | credentials | notes |
|---|---|---|---|
| `openrouter` | `@openrouter/ai-sdk-provider` | `apiKey` (required) | default `https://openrouter.ai/api/v1`; `provider.routing` passes OpenRouter's provider preferences (`order`, `allow_fallbacks`, `data_collection`, …) |
| `kimi` (alias `moonshot`) | `@ai-sdk/openai-compatible` | `apiKey` (required) | preset `https://api.moonshot.ai/v1` |
| `ollama` | `@ai-sdk/openai-compatible` | none | preset `http://localhost:11434/v1` |
| `lmstudio` | `@ai-sdk/openai-compatible` | none | preset `http://localhost:1234/v1` |
| `nvidia-nim` | `@ai-sdk/openai-compatible` | `apiKey` (required) | preset `https://integrate.api.nvidia.com/v1` |
| `openai-compatible` | `@ai-sdk/openai-compatible` | `baseURL` (required), `apiKey` and `headers` optional | any OpenAI-shaped endpoint |
| `custom` | whatever you use | yours | `instance`: a `LanguageModel` object you construct |

A preset's `baseURL` can be overridden like any other.

```ts
import { createAnthropic } from '@ai-sdk/anthropic';

// Any adapter the registry does not name, or a community one, is one factory call:
const model = createAnthropic({ apiKey, baseURL: 'https://api.anthropic.com/v1' })('claude-haiku-4-5');
aide({ provider: { name: 'custom', model: 'claude-haiku-4-5', instance: model } });
```

`instance` must be a model object with `provider` and `modelId`, never a string. For `custom` the
library cannot see how you built the adapter, so pinning its endpoint and key is up to you.
`model` is still required by the schema; the instance's `modelId` is what is reported.

## Prompt caching

| marker | rows |
|---|---|
| `cacheControl: ephemeral` on the static prefix | `anthropic` |
| `cachePoint` on the static prefix | `amazon-bedrock` |
| none needed (provider-side) or not available | every other row |

`caching: false` removes the markers. See [Configuration → the prompt](configuration.md#the-prompt-and-when-it-caches)
for what keeps the prefix stable.

## fromEnv

`fromEnv(env)` builds a `ProviderConfig` from the object you hand it (`$env/dynamic/private`,
`process.env`, `platform.env`). It reads only these variables and nothing from the process:

| variable | maps to | required |
|---|---|---|
| `SVELTE_CHAT_AIDE_PROVIDER` | `provider.name` | always |
| `SVELTE_CHAT_AIDE_MODEL` | `provider.model` | always |
| `SVELTE_CHAT_AIDE_API_KEY` | `provider.apiKey` | every key-based row (all rows marked `apiKey` (required) above, `azure` included) |
| `SVELTE_CHAT_AIDE_BASE_URL` | `provider.baseURL` | `openai-compatible`; optional elsewhere |
| `SVELTE_CHAT_AIDE_REGION` | `provider.region` | `amazon-bedrock` |
| `SVELTE_CHAT_AIDE_PROJECT`, `SVELTE_CHAT_AIDE_LOCATION` | `provider.project`, `provider.location` | `google-vertex` |
| `SVELTE_CHAT_AIDE_RESOURCE_NAME` | `provider.resourceName` | `azure`, unless `SVELTE_CHAT_AIDE_BASE_URL` is set |
| `SVELTE_CHAT_AIDE_OPTIONS` | `provider.options`, parsed as a JSON object | optional |

It throws, naming the variable, when a required one is missing, the name is not a row, or
`OPTIONS` is not a JSON object. It never falls back to a provider's conventional variable
(`ANTHROPIC_API_KEY`). `custom` cannot come from the environment. Values passed beside it win:

```ts
import { aide, fromEnv } from 'svelte-chat-aide/server';
import { env } from '$env/dynamic/private';

export const handle = aide({
	provider: { ...fromEnv(env), accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
	origin: env.ORIGIN
});
```

(Bedrock's access keys and Vertex's `credentials` have no `SVELTE_CHAT_AIDE_*` variable; pass
them like this, or rely on the platform's default credential chain.)
