/**
 * The one tool (spec §3.3): `read_page({ route })` returns the text of one page of this site.
 * Its argument is the visitor's to steer, so it is treated as hostile: the route rule of
 * `site/route.ts` decides, and a refused route makes no read.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { PageEntry } from '../shared/types.js';
import { acceptRoute } from '../site/route.js';
import { dataBlock } from './prompt.js';

export const NOT_A_PAGE = 'Not a page of this site.';

export interface ReadPageToolOptions {
	origin?: string;
	exclude: string[];
	siteMap: { readForTool(route: string): Promise<PageEntry | null> };
	pageChars: number;
}

function attr(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/[\r\n]+/g, ' ');
}

export function createReadPageTool(opts: ReadPageToolOptions): Tool<{ route: string }, string> {
	return tool({
		description:
			"Read the full text of one page of this website by its route (a path such as /pricing). " +
			'Use it when the outline names a page that likely answers the question and the current page does not.',
		inputSchema: z.object({ route: z.string() }),
		execute: async ({ route }): Promise<string> => {
			const accepted = acceptRoute(route, { origin: opts.origin, exclude: opts.exclude });
			if (accepted === null) return NOT_A_PAGE;
			let entry: PageEntry | null;
			try {
				entry = await opts.siteMap.readForTool(accepted);
			} catch {
				entry = null;
			}
			if (!entry) return `No readable page at ${accepted}.`;
			const text = entry.text.length > opts.pageChars ? entry.text.slice(0, opts.pageChars) : entry.text;
			let label = `page route="${attr(accepted)}"`;
			if (entry.title) label += ` title="${attr(entry.title)}"`;
			if (text.length < entry.text.length) label += ' truncated="true"';
			return dataBlock(label, text);
		}
	});
}
