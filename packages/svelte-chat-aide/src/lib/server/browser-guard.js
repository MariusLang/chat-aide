// Resolved instead of ./index.js under the `browser` export condition.
// The specifier below does not exist, so a client bundle that imports
// `svelte-chat-aide/server` fails to build with this name in the error.
// @ts-expect-error -- intentionally unresolvable; the build error is the point.
import 'svelte-chat-aide/server-only-imported-in-browser';

if (typeof window !== 'undefined') {
	throw new Error('svelte-chat-aide/server imported in the browser');
}
