// Resolved instead of ./index.js under the `browser` export condition.
// The specifier below does not exist, so a client bundle that imports
// `@chat-aide/sveltekit/server` fails to build with this name in the error.
// @ts-expect-error -- intentionally unresolvable; the build error is the point.
import '@chat-aide/sveltekit/server-only-imported-in-browser';

if (typeof window !== 'undefined') {
	throw new Error('@chat-aide/sveltekit/server imported in the browser');
}
