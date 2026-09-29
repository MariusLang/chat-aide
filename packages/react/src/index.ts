/**
 * `@chat-aide/react`: the chat widget for React sites. Pair it with a server adapter
 * (`@chat-aide/next`, or `createAide` from `@chat-aide/core` on any web-standard framework).
 *
 * ```tsx
 * import { ChatWidget } from '@chat-aide/react';
 * import '@chat-aide/react/plain.css';
 *
 * <ChatWidget />
 * ```
 */
export { useAide, type AideChat } from './use-aide.js';
export {
	ChatWidget,
	ChatWindow,
	ChatLauncher,
	Transcript,
	Message,
	Markdown,
	Composer,
	type ChatWidgetProps,
	type ChatWindowProps,
	type MarkdownProps,
	type Navigate
} from './components.js';
export {
	DEFAULT_STRINGS,
	messageText,
	type AnswerLinks,
	type ChatError,
	type ChatOptions,
	type ChatStatus,
	type Strings,
	type Suggestions,
	type Usage,
	type WidgetMode,
	type WidgetPosition
} from '@chat-aide/core/client';
