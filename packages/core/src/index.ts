/**
 * `@chat-aide/core`: the framework-neutral server. `createAide` mounts it on any framework with
 * web-standard `Request` / `Response`; `createChatHandler` is the handler itself, for adapters.
 */
export { createAide, toAideEvent, headerAddress, type Aide, type WebContext, type WebHandler } from './server/web.js';
export { createChatHandler, type ChatHandler, type ChatHandlerDeps } from './server/handler.js';
export { fromEnv } from './server/from-env.js';
export { memoryStore } from './server/store.js';
export { defaultSystemPrompt } from './server/prompt.js';
export { AideConfigError } from './shared/schemas.js';
export type {
	AideConfig,
	AideEvent,
	ProviderConfig,
	Store,
	Page,
	PromptContext,
	Usage,
	Persona,
	MessageEvent,
	ResponseEvent,
	RefusedEvent,
	ErrorEvent
} from './shared/types.js';
