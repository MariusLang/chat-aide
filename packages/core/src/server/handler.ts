/**
 * The chat endpoint (spec §3.3–§3.7, §6). `GET ?route=` warms the page and the crawl and says
 * whether the widget should send the DOM; `POST` answers one turn as the AI SDK's UI message
 * stream; anything else is `405`. Every refusal is opaque JSON `{ error, message }`.
 */
import {
	convertToModelMessages,
	createUIMessageStreamResponse,
	isStepCount,
	streamText,
	toUIMessageStream,
	type LanguageModelUsage,
	type TextStreamPart,
	type ToolSet,
	type UIMessage
} from 'ai';
import { AideConfigError, createBodySchema, resolveConfig, type UIMessageLike } from '../shared/schemas.js';
import { REFUSAL_MESSAGES } from '../shared/strings.js';
import type {
	AideConfig,
	AideEvent,
	ErrorCode,
	PageEntry,
	PromptContext,
	ResolvedConfig,
	Usage,
	WarmupResponse
} from '../shared/types.js';
import { createPageCache, type PageCache } from '../site/cache.js';
import { createReader, type Reader } from '../site/read-page.js';
import { acceptRoute } from '../site/route.js';
import { createSiteMap, type SiteMap } from '../site/site-map.js';
import { createTransport, type FetchLike, type Transport } from '../site/transport.js';
import { resolveWaitUntil, runCallback, VERCEL_CONTEXT, type WaitUntil } from './background.js';
import { checkOrigin, clientId, createGuards } from './guards.js';
import { buildPrompt } from './prompt.js';
import { findProvider, loadProvider, type Importer, type LoadedProvider, type ProviderRow } from './providers.js';
import { createReadPageTool } from './read-page-tool.js';
import { memoryStore } from './store.js';
import { warn } from './warn.js';
import { windowHistory } from './window.js';

export interface ChatHandler<E extends AideEvent = AideEvent> {
	/** `GET ?route=` warm-up, `POST` chat, any other method `405`. */
	(event: E): Promise<Response>;
	config: ResolvedConfig<E>;
	siteMap: SiteMap;
	transport: Transport;
	reader: Reader;
	cache: PageCache;
	/** Resolves once the provider's adapter is loaded; rejects with the `pnpm add` line when it is missing. */
	ready: Promise<void>;
	/**
	 * Hands this request's `event.fetch` to the transport for in-process reads — only for a
	 * request that came through `aide()` and whose origin passes the transport's rule. `ifUnset`
	 * (the llms paths): only when no fetch has been adopted yet.
	 */
	adoptFetch(event: AideEvent, ifUnset?: boolean): void;
	/**
	 * Counts one request in the visitor's warm-up bucket (the llms paths share it with `GET`
	 * warm-ups, since both start the crawl): `null` when allowed, else the `429 rate_limited` answer.
	 */
	limitWarmup(event: E): Promise<Response | null>;
}

/**
 * Events `aide()` hands to the chat and llms handlers. Only those may lend their `event.fetch`:
 * the hook passes the library's reads straight to the app, while a handler mounted directly
 * (`+server.ts`) would read through the visitor's own request, whose `event.fetch` copies each
 * read's `Set-Cookie` onto the visitor's response (SvelteKit `fetch.js`, `set_internal`).
 */
const hooked = new WeakSet<object>();

export function markHooked(event: AideEvent): void {
	hooked.add(event);
}

export interface ChatHandlerDeps {
	/** How adapters are imported (tests, and hosts whose file tracing cannot follow `import(pkg)`). */
	importer?: Importer;
	now?: () => number;
	/** The fetch used for network reads of the configured origin (default `globalThis.fetch`). */
	fetch?: FetchLike;
}

/** Names shown in the widget's disclosure ("… sent to this site and to <provider>"). */
const DISPLAY_NAMES: Record<string, string> = {
	anthropic: 'Anthropic',
	openai: 'OpenAI',
	azure: 'Azure OpenAI',
	google: 'Google',
	'google-vertex': 'Google Vertex AI',
	'amazon-bedrock': 'Amazon Bedrock',
	mistral: 'Mistral AI',
	xai: 'xAI',
	groq: 'Groq',
	deepseek: 'DeepSeek',
	cohere: 'Cohere',
	togetherai: 'Together AI',
	fireworks: 'Fireworks AI',
	deepinfra: 'DeepInfra',
	cerebras: 'Cerebras',
	perplexity: 'Perplexity',
	baseten: 'Baseten',
	huggingface: 'Hugging Face',
	openrouter: 'OpenRouter',
	kimi: 'Moonshot AI',
	ollama: 'Ollama',
	lmstudio: 'LM Studio',
	'nvidia-nim': 'NVIDIA NIM'
};

const STATUS: Record<ErrorCode, number> = {
	invalid_request: 400,
	unauthorized: 403,
	origin_refused: 403,
	method_not_allowed: 405,
	rate_limited: 429,
	budget_exhausted: 429,
	provider_error: 502
};

/** Stream parts that come before the model has said anything. */
const PREAMBLE = new Set(['start', 'start-step']);

/**
 * Every part of a tool's life (`tool-input-*`, `tool-call`, `tool-result`, `tool-error`, …). They
 * carry the `read_page` input and page text, which the widgets never show and the server discards
 * when the history comes back, so they stay on the server, like the model's reasoning.
 */
function isToolPart(part: TextStreamPart<ToolSet>): boolean {
	return part.type.startsWith('tool-');
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
	});
}

/** Headroom in a chat body for JSON syntax, ids and the `aide` fields. */
const BODY_SLACK_BYTES = 64 * 1024;

/**
 * The request body as JSON, read at most `cap` bytes: a declared `content-length` over the cap is
 * refused unread, a body that grows past it is cancelled. `undefined` for too large or not JSON.
 */
async function readJson(request: Request, cap: number): Promise<unknown> {
	const declared = Number(request.headers.get('content-length'));
	if (declared > cap) {
		request.body?.cancel().catch(() => {});
		return undefined;
	}
	if (!request.body) return undefined;
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > cap) {
				reader.cancel().catch(() => {});
				return undefined;
			}
			chunks.push(value);
		}
	} catch {
		return undefined;
	}
	const all = new Uint8Array(size);
	let at = 0;
	for (const c of chunks) {
		all.set(c, at);
		at += c.byteLength;
	}
	try {
		return JSON.parse(new TextDecoder().decode(all));
	} catch {
		return undefined;
	}
}

function randomSalt(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Spec §3.2: the library reads no environment variable. An adapter given no `apiKey` reads its
 * own (`ANTHROPIC_API_KEY`, …), so a keyed row without one is refused at creation. Rows whose
 * credentials legitimately come from elsewhere (Bedrock, Vertex, keyless presets, a custom
 * `openai-compatible` endpoint, a custom model) are exempt.
 */
function requireApiKey(row: ProviderRow | undefined, apiKey: string | undefined): void {
	if (!row) return; // unknown names are refused by loadProvider with the list of rows
	if (row.credentials !== 'apiKey' && row.credentials !== 'azure') return;
	if (apiKey) return;
	throw new AideConfigError(
		'provider.apiKey',
		`is required for provider "${row.name}". The library reads no environment variable itself, ` +
			'so pass the key in (for example with fromEnv(env))'
	);
}

function displayName(config: ResolvedConfig, row: ProviderRow | undefined): string {
	const p = config.provider;
	if (row?.credentials === 'custom' && p.instance && typeof p.instance.provider === 'string') return p.instance.provider;
	if (row?.credentials === 'openai-compatible' && p.baseURL) {
		try {
			return new URL(p.baseURL).host;
		} catch {
			/* fall through */
		}
	}
	return (row && DISPLAY_NAMES[row.name]) ?? row?.name ?? p.name;
}

function suggestionsFor(config: ResolvedConfig, route: string): string[] {
	const s = config.suggestions;
	if (!s) return [];
	if (Array.isArray(s)) return s;
	return s[route] ?? s['*'] ?? [];
}

/** Keeps text parts only: tool parts and anything else the client sends are not the client's to add. */
function textOnly(messages: UIMessageLike[]): UIMessageLike[] {
	const out: UIMessageLike[] = [];
	for (const m of messages) {
		const parts = m.parts
			.filter((p) => p.type === 'text' && typeof p.text === 'string' && p.text.length > 0)
			.map((p) => ({ type: 'text', text: p.text as string }));
		if (parts.length > 0) out.push({ role: m.role, parts });
	}
	return out;
}

function lastUserText(messages: UIMessageLike[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role === 'user') return m.parts.map((p) => p.text ?? '').join('');
	}
	return '';
}

function pickUsage(u: LanguageModelUsage | undefined): Usage {
	if (!u) return {};
	return {
		inputTokens: u.inputTokens,
		outputTokens: u.outputTokens,
		totalTokens: u.totalTokens,
		inputTokenDetails: {
			noCacheTokens: u.inputTokenDetails?.noCacheTokens,
			cacheReadTokens: u.inputTokenDetails?.cacheReadTokens,
			cacheWriteTokens: u.inputTokenDetails?.cacheWriteTokens
		},
		outputTokenDetails: {
			textTokens: u.outputTokenDetails?.textTokens,
			reasoningTokens: u.outputTokenDetails?.reasoningTokens
		}
	};
}

/** Platforms that announce themselves on the request, not through the environment. */
function platformDetected(event: AideEvent): boolean {
	const platform = (event as { platform?: unknown }).platform;
	if (platform && typeof platform === 'object') {
		const p = platform as Record<string, unknown>;
		if ('context' in p || 'env' in p || 'caches' in p) return true;
	}
	return (globalThis as Record<symbol, unknown>)[VERCEL_CONTEXT] !== undefined;
}

function platformWaitUntil(event: AideEvent): boolean {
	const context = (event as { platform?: { context?: { waitUntil?: unknown } } }).platform?.context;
	if (typeof context?.waitUntil === 'function') return true;
	return (globalThis as Record<symbol, unknown>)[VERCEL_CONTEXT] !== undefined;
}

export function createChatHandler<E extends AideEvent = AideEvent>(
	input: AideConfig<E>,
	deps: ChatHandlerDeps = {}
): ChatHandler<E> {
	const config = resolveConfig(input) as unknown as ResolvedConfig<E>;
	/** The same config for helpers that never call `authorize` or `clientKey` (the event type is theirs only). */
	const plain = config as unknown as ResolvedConfig;
	const row = findProvider(config.provider.name);
	requireApiKey(row, config.provider.apiKey);

	const now = deps.now ?? Date.now;
	const { limits } = config;
	const origin = config.origin;
	const exclude = config.pages.exclude;

	// The adapter import starts now and is awaited per request, so a missing adapter is found
	// by `ready` (a smoke test) or at the latest by the first request.
	const loaded: Promise<LoadedProvider> = loadProvider(config.provider, deps.importer);
	const ready = loaded.then(() => undefined);
	loaded.catch(() => {});
	ready.catch(() => {});

	const store = config.store ?? memoryStore({ now });
	const salt = config.salt ?? randomSalt();
	const guards = createGuards(config, store, now);
	const transport = createTransport({ origin, exclude, networkFetch: deps.fetch });
	const cache = createPageCache({
		maxPages: limits.maxPages,
		ttlSeconds: config.cache.ttlSeconds,
		missSeconds: config.cache.missSeconds,
		store: config.store,
		now
	});
	const reader = createReader({ transport, cache, limits, preferMarkdown: config.llms.preferMarkdown, now });
	const siteMap = createSiteMap({ reader, transport, cache, config: plain, now });
	// The DOM text may be up to the pageChars ceiling; it is truncated to pageChars below.
	const bodySchema = createBodySchema(limits, config.limitCeilings);
	// Every message at its longest, escaped, plus the DOM text at its ceiling (UTF-8), plus slack.
	const bodyCap = limits.messages * limits.messageChars * 10 + config.limitCeilings.pageChars * 3 + BODY_SLACK_BYTES;
	const provider = displayName(plain, row);

	let checkedPlatform = false;
	/**
	 * Deferred to the first request, since only a request shows the platform. The library reads no
	 * environment variable, so the signal is the request's `platform` (Cloudflare, Netlify) or a live
	 * Vercel request context.
	 */
	function platformWarnings(event: AideEvent): void {
		if (checkedPlatform) return;
		checkedPlatform = true;
		if (!platformDetected(event)) return;
		if (!platformWaitUntil(event) && !config.waitUntil) {
			warn(
				'this looks like a serverless platform, but no waitUntil was found on event.platform and none is ' +
					'configured: the crawl, cache refreshes and callbacks may be cut short when the response ends. ' +
					"Pass the platform's waitUntil as config.waitUntil."
			);
		}
		if (!config.store) {
			warn(
				'this looks like a serverless platform and no store is configured: each instance keeps its own ' +
					'rate limits, budgets and site map, so limits multiply by the instance count and every cold start ' +
					're-crawls. Pass a shared store (and salt).'
			);
		}
	}

	function adoptFetch(event: AideEvent, ifUnset = false): void {
		if (!hooked.has(event)) {
			if (origin === undefined) {
				warn(
					'the chat or llms handler is mounted directly, not through the aide() hook, and no origin is ' +
						'configured: the site cannot be read. Set config.origin (reads then go over the network to ' +
						'it), or mount through aide().'
				);
			}
			return;
		}
		if (ifUnset && transport.hasInProcessFetch()) return;
		transport.setInProcessFetch(event.fetch, event.url.origin);
	}

	async function limitWarmup(event: E): Promise<Response | null> {
		const id = await clientId(event, { salt, clientKey: config.clientKey });
		if (await guards.rate('warmup', id)) return null;
		return refuse('rate_limited', await resolveWaitUntil(event, config.waitUntil), null);
	}

	function onErrorFor(sessionId: string | null, waitUntil: WaitUntil) {
		return (error: unknown) =>
			runCallback(waitUntil, config.onError, { sessionId, error, at: new Date() }, undefined, sessionId);
	}

	function refuse(
		code: ErrorCode,
		waitUntil: WaitUntil,
		sessionId: string | null,
		extra: Record<string, unknown> = {},
		headers: Record<string, string> = {}
	): Response {
		runCallback(waitUntil, config.onRefused, { sessionId, code, at: new Date() }, config.onError, sessionId);
		return json({ error: code, message: REFUSAL_MESSAGES[code], ...extra }, STATUS[code], headers);
	}

	/** Whether the server asks the widget for the page's DOM text. */
	function wantsDom(entry: PageEntry | null): boolean {
		return config.pageContext === 'dom' || (config.pageContext === 'auto' && (!entry || entry.thin));
	}

	async function warmup(event: E, waitUntil: WaitUntil): Promise<Response> {
		const route = acceptRoute(event.url.searchParams.get('route'), { origin, exclude });
		if (route === null) return refuse('invalid_request', waitUntil, null, { path: 'route' });
		siteMap.ensureStarted(waitUntil);
		const entry = await reader.readPage(route, { waitUntil });
		const body: WarmupResponse = {
			pageSource: wantsDom(entry) ? 'dom' : 'server',
			suggestions: suggestionsFor(plain, route),
			mapped: siteMap.isMapped(route),
			provider,
			limits: { messages: limits.messages, messageChars: limits.messageChars, pageChars: limits.pageChars }
		};
		return json(body);
	}

	/** The current page (spec §3.3 part 5, §3.6): DOM text only when the server would ask for it. */
	function currentPage(route: string, entry: PageEntry | null, dom: string | null) {
		if (wantsDom(entry) && dom) return { route, title: entry?.title, text: dom };
		if (config.pageContext === 'dom') return null;
		return entry ? { route, title: entry.title, text: entry.text } : null;
	}

	async function chat(event: E, waitUntil: WaitUntil, id: string, started: number): Promise<Response> {
		const raw = await readJson(event.request, bodyCap);
		if (raw === undefined) return refuse('invalid_request', waitUntil, null, { path: '' });
		const parsed = bodySchema.safeParse(raw);
		if (!parsed.success) {
			const issue = parsed.error.issues[0];
			return refuse('invalid_request', waitUntil, null, { path: issue ? issue.path.map(String).join('.') : '' });
		}
		const body = parsed.data;
		const sessionId = body.aide.sessionId;
		const route = acceptRoute(body.aide.route, { origin, exclude });
		if (route === null) return refuse('invalid_request', waitUntil, sessionId, { path: 'aide.route' });

		const windowed = windowHistory(textOnly(body.messages), limits);
		if (windowed.length === 0 || windowed[windowed.length - 1]!.role !== 'user') {
			return refuse('invalid_request', waitUntil, sessionId, { path: 'messages' });
		}

		const budget = await guards.budgetOk(id);
		if (budget !== 'ok') return refuse('budget_exhausted', waitUntil, sessionId);

		const model = await loaded; // a missing adapter throws here, for the developer to see

		runCallback(
			waitUntil,
			config.onMessage,
			{ sessionId, route, text: lastUserText(windowed), at: new Date() },
			config.onError,
			sessionId
		);

		siteMap.ensureStarted(waitUntil);
		await siteMap.waitFor(limits.crawlBudgetMs);
		const entry = await reader.readPage(route, { waitUntil });
		const dom = body.aide.dom === null ? null : body.aide.dom.slice(0, limits.pageChars);
		const page = currentPage(route, entry, dom);

		let history;
		try {
			history = await convertToModelMessages(windowed as unknown as UIMessage[]);
		} catch {
			return refuse('invalid_request', waitUntil, sessionId, { path: 'messages' });
		}

		const outline = siteMap.outline(limits.outlineChars);
		const ctx: PromptContext = { route, site: siteMap.site(), persona: config.persona };
		const prompt = buildPrompt({
			systemPrompt: config.systemPrompt,
			persona: config.persona,
			facts: config.facts,
			outline: outline.text,
			outlinePartial: outline.partial,
			ctx,
			page,
			history,
			cache: model.row.cache,
			caching: config.caching,
			pageChars: limits.pageChars
		});

		const reportError = onErrorFor(sessionId, waitUntil);
		const tools = {
			read_page: createReadPageTool({ origin, exclude, siteMap, pageChars: limits.pageChars })
		};

		let spent = 0;
		const result = streamText({
			model: model.model,
			instructions: prompt.instructions,
			messages: prompt.messages,
			tools,
			stopWhen: isStepCount(limits.maxSteps),
			maxOutputTokens: limits.maxOutputTokens,
			telemetry: { isEnabled: false },
			onError: ({ error }) => reportError(error),
			// Usage is summed per finished step, so a turn that fails in a later step still pays for
			// the steps it ran; the sum is charged once the stream has settled, however it ended.
			onStepEnd: (step) => {
				spent += (step.usage.inputTokens ?? 0) + (step.usage.outputTokens ?? 0);
			},
			onEnd: (e) => {
				runCallback(
					waitUntil,
					config.onResponse,
					{
						sessionId,
						route,
						text: e.steps.map((s) => s.text).join(''),
						usage: e.usage,
						model: model.modelId,
						provider: model.providerName,
						durationMs: now() - started,
						finishReason: e.finishReason,
						toolCalls: e.steps.flatMap((s) => s.toolCalls.map((c) => ({ name: c.toolName, input: c.input }))),
						at: new Date()
					},
					config.onError,
					sessionId
				);
			}
		});

		// Run the turn to its end even when the visitor disconnects, so usage is charged.
		const consumed = Promise.resolve(result.consumeStream())
			.catch(() => {})
			.then(() => guards.charge(id, spent))
			.catch((error: unknown) => reportError(error));
		waitUntil(consumed);

		// Read up to the model's first output: an error there is a provider error before the stream.
		const source = result.stream.getReader();
		const buffered: TextStreamPart<ToolSet>[] = [];
		for (;;) {
			const next = await source.read();
			if (next.done) break;
			if (next.value.type === 'error') {
				source.cancel().catch(() => {});
				return refuse('provider_error', waitUntil, sessionId);
			}
			// A tool call is the model's first output too: it ends this wait, but is not sent on.
			if (!isToolPart(next.value)) buffered.push(next.value);
			if (!PREAMBLE.has(next.value.type)) break;
		}

		const stream = new ReadableStream<TextStreamPart<ToolSet>>({
			start(controller) {
				for (const part of buffered) controller.enqueue(part);
			},
			async pull(controller) {
				// A pull that enqueues nothing is not pulled again, so read past the dropped parts.
				for (;;) {
					const next = await source.read();
					if (next.done) {
						controller.close();
						return;
					}
					if (isToolPart(next.value)) continue;
					controller.enqueue(next.value);
					return;
				}
			},
			cancel(reason) {
				return source.cancel(reason);
			}
		});

		return createUIMessageStreamResponse({
			stream: toUIMessageStream({
				stream,
				// The model's reasoning is not the visitor's to read or to send back in the thread.
				sendReasoning: false,
				onError: () => REFUSAL_MESSAGES.provider_error,
				messageMetadata: ({ part }) => (part.type === 'finish' ? { usage: pickUsage(part.totalUsage) } : undefined)
			})
		});
	}

	const handler = (async (event: E): Promise<Response> => {
		const started = now();
		adoptFetch(event);
		const waitUntil = await resolveWaitUntil(event, config.waitUntil);
		platformWarnings(event);

		const method = event.request.method.toUpperCase();
		if (method !== 'GET' && method !== 'POST') {
			return refuse('method_not_allowed', waitUntil, null, {}, { allow: 'GET, POST' });
		}
		if (!checkOrigin(event.request, { origin, allowedOrigins: config.allowedOrigins })) {
			return refuse('origin_refused', waitUntil, null);
		}
		if (config.authorize) {
			let verdict: boolean | Response;
			try {
				verdict = await config.authorize(event);
			} catch (error) {
				onErrorFor(null, waitUntil)(error);
				verdict = false;
			}
			if (verdict instanceof Response) {
				runCallback(waitUntil, config.onRefused, { sessionId: null, code: 'unauthorized', at: new Date() }, config.onError);
				return verdict;
			}
			if (verdict !== true) return refuse('unauthorized', waitUntil, null);
		}
		const id = await clientId(event, { salt, clientKey: config.clientKey });
		if (!(await guards.rate(method === 'GET' ? 'warmup' : 'chat', id))) {
			return refuse('rate_limited', waitUntil, null);
		}
		return method === 'GET' ? warmup(event, waitUntil) : chat(event, waitUntil, id, started);
	}) as ChatHandler<E>;

	handler.config = config;
	handler.siteMap = siteMap;
	handler.transport = transport;
	handler.reader = reader;
	handler.cache = cache;
	handler.ready = ready;
	handler.adoptFetch = adoptFetch;
	handler.limitWarmup = limitWarmup;
	return handler;
}
