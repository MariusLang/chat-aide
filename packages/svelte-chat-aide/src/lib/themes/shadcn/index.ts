/**
 * `svelte-chat-aide/themes/shadcn` (spec §3.9 layer 3): the default theme, re-exported by the
 * package root. Built from shadcn-svelte components (generated into `./ui`) and Tailwind 4
 * classes under `prefix(aide)`, precompiled into `./styles.css`, which the components import.
 */
export { default as ChatWidget } from './ChatWidget.svelte';
export { default as ChatWindow } from './ChatWindow.svelte';
export { default as ChatLauncher } from './ChatLauncher.svelte';
export {
	createChat,
	messageText,
	DEFAULT_STRINGS,
	type AnswerLinks,
	type ChatError,
	type ChatOptions,
	type ChatStatus,
	type ChatStore,
	type Strings,
	type Suggestions,
	type Usage,
	type WidgetMode,
	type WidgetPosition
} from '../../headless/index.js';
