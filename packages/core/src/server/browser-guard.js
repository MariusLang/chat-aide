// Resolved instead of the server entries under the `browser` export condition.
// The specifier below does not exist, so a client bundle that imports
// `@chat-aide/core` (or its llms / internal entries) fails to build with this name in the error.
// @ts-expect-error -- intentionally unresolvable; the build error is the point.
import '@chat-aide/core/server-only-imported-in-browser';

if (typeof window !== 'undefined') {
	throw new Error('@chat-aide/core imported in the browser');
}
