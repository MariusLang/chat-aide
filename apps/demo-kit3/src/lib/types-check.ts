/**
 * Compile-time checks run by `svelte-check`: the library's types resolve against SvelteKit 3.
 * A type the library imports from `@sveltejs/kit` that Kit 3 no longer exports turns into `any`
 * (hidden by `skipLibCheck`), so each check below also fails when its type is `any`.
 */
import type { RequestEvent } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import type { AideConfig, AideHandle } from '@chat-aide/sveltekit/server';

declare const handle: AideHandle;
declare const event: Parameters<NonNullable<AideConfig['clientKey']>>[0];

// `aide()` fits Kit 3's `Handle`, and `clientKey` receives Kit 3's `RequestEvent`.
export const asHandle: Handle = handle;
export const asEvent: RequestEvent = event;

// Neither is `any`: an unknown property is an error.
// @ts-expect-error not a property of AideHandle
export const noHandleProp = handle.notAProperty;
// @ts-expect-error not a property of RequestEvent
export const noEventProp = event.notAProperty;
