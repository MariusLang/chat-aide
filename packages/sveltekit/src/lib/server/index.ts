/**
 * `@chat-aide/sveltekit/server`: the SvelteKit hook, the explicit handler, and the public server
 * types. Everything but the hook comes from `@chat-aide/core`.
 */
import type { RequestEvent } from '@sveltejs/kit';
import { createChatHandler as coreCreateChatHandler, type ChatHandler as CoreChatHandler, type ChatHandlerDeps } from '@chat-aide/core';
import type { AideConfig } from './hook.js';

export { aide, type AideHandle, type AideConfig } from './hook.js';
export { fromEnv, memoryStore, defaultSystemPrompt, AideConfigError } from '@chat-aide/core';
export type {
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
} from '@chat-aide/core';

export type ChatHandler = CoreChatHandler<RequestEvent>;

/** The chat handler for hand-mounted routes (`+server.ts`); see "Mounting by hand". */
export function createChatHandler(config: AideConfig, deps?: ChatHandlerDeps): ChatHandler {
	return coreCreateChatHandler<RequestEvent>(config, deps);
}
