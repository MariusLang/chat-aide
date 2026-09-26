/**
 * `cn` for the shadcn theme (spec §3.9 layer 3): the generated `ui/` components import it in
 * place of shadcn-svelte's `$lib/utils`. tailwind-merge is told about the `aide:` prefix so that
 * `aide:px-2 aide:px-4` still merges to the last one.
 */
import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const merge = extendTailwindMerge({ prefix: 'aide' });

export function cn(...inputs: ClassValue[]): string {
	return merge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
