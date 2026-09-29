/**
 * `svelte-chat-aide/headless` (spec §3.9 layer 1): the chat store and unstyled components that
 * render structure with `data-part` attributes and no CSS.
 */
export {
	createChat,
	messageText,
	type AnswerLinks,
	type ChatError,
	type ChatOptions,
	type ChatStatus,
	type ChatStore,
	type WidgetMode,
	type WidgetPosition
} from './create-chat.svelte.js';
export { trapFocus, focusableIn, type FocusTrapOptions } from '@chat-aide/core/client';
export { default as ChatWidget } from './ChatWidget.svelte';
export { default as ChatLauncher } from './ChatLauncher.svelte';
export { default as ChatWindow } from './ChatWindow.svelte';
export { default as Transcript } from './Transcript.svelte';
export { default as Message } from './Message.svelte';
export { default as Markdown } from './Markdown.svelte';
export { default as MdInline } from './MdInline.svelte';
export { default as Composer } from './Composer.svelte';
export { DEFAULT_STRINGS, type Strings } from '@chat-aide/core/client';
export type { Suggestions, Usage } from '@chat-aide/core/client';
export type { MdBlock, MdInline as MdInlineNode } from '@chat-aide/core/client';
