/**
 * `@chat-aide/core/internal`: pieces for framework adapters (the SvelteKit hook). Not a stable
 * API. `markHooked` lends an event's in-process `fetch` to the site reader: call it only for
 * events whose framework passes the library's own reads (marked with `INTERNAL_HEADER`) straight
 * to the app, never for a visitor's request that could copy cookies back.
 */
export { markHooked } from './server/handler.js';
export { warn } from './server/warn.js';
export { routeForMarkdownPath, parseLlmsTxt } from './site/llms.js';
export { INTERNAL_HEADER, INTERNAL_MARKER, SERVED_HEADER, SERVED_MARKER, type FetchLike } from './site/transport.js';
export { llmsTxt, llmsFullTxt, pageMarkdown, type EventHandler } from './llms/index.js';
