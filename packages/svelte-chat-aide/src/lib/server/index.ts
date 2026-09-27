/** `svelte-chat-aide/server`: the hook, the explicit handler, and the public server types. */
export { aide, type AideHandle } from './hook.js';
export { createChatHandler, type ChatHandler } from './handler.js';
export { fromEnv } from './from-env.js';
export { memoryStore } from './store.js';
export { defaultSystemPrompt } from './prompt.js';
export type {
	AideConfig,
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
} from '../shared/types.js';
