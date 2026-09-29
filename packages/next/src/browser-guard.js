// Resolved instead of ./index.js under the `browser` export condition: the adapter holds the
// provider key and must never reach a client bundle. The specifier below does not exist, so the
// build fails with this name in the error.
// @ts-expect-error -- intentionally unresolvable; the build error is the point.
import '@chat-aide/next/server-only-imported-in-browser';

if (typeof window !== 'undefined') {
	throw new Error('@chat-aide/next imported in the browser');
}
