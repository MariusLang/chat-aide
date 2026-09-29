/**
 * `svelte-chat-aide/llms`: `/llms.txt`, `/llms-full.txt` and `<route>.md` as SvelteKit
 * `RequestHandler`s bound to a chat handler, for sites that mount the routes by hand.
 */
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { llmsFullTxt as coreFull, llmsTxt as coreTxt, pageMarkdown as coreMd } from '@chat-aide/core/internal';
import type { ChatHandler } from '../server/index.js';

export const llmsTxt = (handler: ChatHandler): RequestHandler => coreTxt<RequestEvent>(handler);
export const llmsFullTxt = (handler: ChatHandler): RequestHandler => coreFull<RequestEvent>(handler);
export const pageMarkdown = (handler: ChatHandler): RequestHandler => coreMd<RequestEvent>(handler);
