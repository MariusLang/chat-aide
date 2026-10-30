/**
 * Background work (spec §3.4 "Background work", §3.7, acceptance #22).
 *
 * The crawl, stale-while-revalidate refreshes and server callbacks outlive the response.
 * Each such promise is handed to a `WaitUntil`, resolved per request in this order:
 *
 * 1. `event.platform.context.waitUntil` (Cloudflare, Netlify), called with its context bound;
 * 2. `waitUntil` from `@vercel/functions`, but only when the import resolves AND a Vercel
 *    request context is live. That function reads `globalThis[Symbol.for('@vercel/request-context')]`
 *    and silently does nothing when it is absent (and throws a TypeError for a non-promise), so
 *    picking it merely because the package is installed would shadow `config.waitUntil` with a
 *    no-op off Vercel. The context check is how "running on Vercel" is decided without reading
 *    any environment variable;
 * 3. `config.waitUntil`;
 * 4. fire-and-forget (correct on a long-lived Node process; may be cut short on serverless).
 *
 * Every returned `WaitUntil` never throws to its caller and never lets a rejection go unhandled.
 */

export type WaitUntil = (p: Promise<unknown>) => void;

type ErrorHandler = (e: { sessionId: string | null; error: unknown; at: Date }) => unknown;

const VERCEL_CONTEXT = Symbol.for('@vercel/request-context');

const noop = () => {};

/** Mark a promise as handled without changing what other holders of it see. */
function handled(p: Promise<unknown>): Promise<unknown> {
	if (p && typeof p.then === 'function') p.then(noop, noop);
	return p;
}

function safe(fn: (p: Promise<unknown>) => unknown): WaitUntil {
	return (p) => {
		try {
			fn(handled(p));
		} catch {
			// The promise is already running; losing the platform hint is the worst case.
		}
	};
}

const fireAndForget: WaitUntil = (p) => {
	handled(p);
};

let vercelImport: Promise<WaitUntil | null> | undefined;

/** Dynamic, cached import of the optional peer `@vercel/functions`. */
function loadVercelWaitUntil(): Promise<WaitUntil | null> {
	vercelImport ??= import('@vercel/functions').then(
		(m) => (typeof m?.waitUntil === 'function' ? (m.waitUntil as WaitUntil) : null),
		() => null
	);
	return vercelImport;
}

function vercelContextLive(): boolean {
	try {
		const store = (globalThis as Record<symbol, { get?: () => unknown } | undefined>)[VERCEL_CONTEXT];
		const ctx = store?.get?.() as { waitUntil?: unknown } | undefined;
		return typeof ctx?.waitUntil === 'function';
	} catch {
		return false;
	}
}

export async function resolveWaitUntil(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	event: { platform?: any } | null,
	configured?: WaitUntil
): Promise<WaitUntil> {
	const context = event?.platform?.context;
	if (context && typeof context.waitUntil === 'function') {
		return safe((p) => context.waitUntil(p));
	}
	if (vercelContextLive()) {
		const vercel = await loadVercelWaitUntil();
		if (vercel) return safe(vercel);
	}
	if (typeof configured === 'function') return safe(configured);
	return fireAndForget;
}

const SERVERLESS_MARKERS = [
	'VERCEL',
	'NETLIFY',
	'AWS_LAMBDA_FUNCTION_NAME',
	'LAMBDA_TASK_ROOT',
	'CF_PAGES',
	'K_SERVICE',
	'FUNCTION_TARGET',
	'FUNCTIONS_WORKER_RUNTIME'
] as const;

/** True when the env object handed in carries a known serverless platform marker. Reads nothing itself. */
export function isLikelyServerless(env?: Record<string, string | undefined>): boolean {
	if (!env) return false;
	return SERVERLESS_MARKERS.some((key) => !!env[key]);
}

/**
 * Start `fn(arg)` on a microtask, catch any throw or rejection and hand it to `onError`
 * (whose own failure is dropped), and pass the whole, never-rejecting promise to `waitUntil`.
 */
export function runCallback<T>(
	waitUntil: WaitUntil,
	fn: ((arg: T) => unknown) | undefined,
	arg: T,
	onError?: ErrorHandler,
	sessionId?: string | null
): void {
	if (typeof fn !== 'function') return;
	const run = Promise.resolve()
		.then(() => fn(arg))
		.then(noop, (error: unknown) => {
			if (!onError) return;
			return Promise.resolve()
				.then(() => onError({ sessionId: sessionId ?? null, error, at: new Date() }))
				.then(noop, noop);
		});
	try {
		waitUntil(run);
	} catch {
		// `run` is already started and never rejects.
	}
}
