/**
 * `@chat-aide/sveltekit/themes/plain` (spec §3.9 layer 2): the headless components in a
 * `data-aide-theme="plain"` root with a dependency-free stylesheet. The components inline the
 * CSS in one `<style nonce>`; `@chat-aide/sveltekit/themes/plain/plain.css` is exported for hosts
 * that link it instead (then pass `stylesheet={false}`).
 */
export { default as ChatWidget } from './ChatWidget.svelte';
export { default as ChatWindow } from './ChatWindow.svelte';
export {
	createChat,
	type ChatOptions,
	type ChatStore,
	type WidgetMode,
	type WidgetPosition
} from '../../headless/create-chat.svelte.js';
