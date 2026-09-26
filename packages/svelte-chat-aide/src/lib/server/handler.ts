/**
 * The chat endpoint (spec §3.3–§3.7, §6). `GET ?route=` warms the page and the crawl and says
 * whether the widget should send the DOM; `POST` answers one turn as the AI SDK's UI message
 * stream; anything else is `405`. Every refusal is opaque JSON `{ error, message }`.
 */
import type { RequestEvent } from '@sveltejs/kit';
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
import { AideConfigError, createBodySchema, resolveConfig, type UIMessageLike } from '../shared/schemas';
import { REFUSAL_MESSAGES } from '../shared/strings';
import type {
	AideConfig,
	ErrorCode,
	PageEntry,
	PromptContext,
	ResolvedConfig,
	Usage,
	WarmupResponse
} from '../shared/types';
import { createPageCache, type PageCache } from '../site/cache';
import { createReader, type Reader } from '../site/read-page';
import { acceptRoute } from '../site/route';
import { createSiteMap, type SiteMap } from '../site/site-map';
import { createTransport, type FetchLike, type Transport } from '../site/transport';
import { isLikelyServerless, resolveWaitUntil, runCallback, type WaitUntil } from './background';
import { checkOrigin, clientId, createGuards } from './guards';
import { buildPrompt } from './prompt';
import { findProvider, loadProvider, type Importer, type LoadedProvider, type ProviderRow } from './providers';
import { createReadPageTool } from './read-page-tool';
import { memoryStore } from './store';
import { warn } from './warn';
import { windowHistory } from './window';

export interface ChatHandler {
	/** `GET ?route=` warm-up, `POST` chat, any other method `405`. */
	(event: RequestEvent): Promise<Response>;
	config: ResolvedConfig;
	siteMap: SiteMap;
	transport: Transport;
	reader: Reader;
	cache: PageCache;
	/** Resolves once the provider's adapter is loaded; rejects with the `pnpm add` line when it is missing. */
	ready: Promise<void>;
}

export interface ChatHandlerDeps {
	/** How adapters are imported (tests). */
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

const VERCEL_CONTEXT = Symbol.for('@vercel/request-context');

/** Stream parts that come before the model has said anything. */
const PREAMBLE = new Set(['start', 'start-step']);

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
	});
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
function platformDetected(event: RequestEvent): boolean {
	const platform = (event as { platform?: unknown }).platform;
	if (platform && typeof platform === 'object') {
		const p = platform as Record<string, unknown>;
		if ('context' in p || 'env' in p || 'caches' in p) return true;
	}
	return (globalThis as Record<symbol, unknown>)[VERCEL_CONTEXT] !== undefined;
}

function platformWaitUntil(event: RequestEvent): boolean {
	const context = (event as { platform?: { context?: { waitUntil?: unknown } } }).platform?.context;
	if (typeof context?.waitUntil === 'function') return true;
	return (globalThis as Record<symbol, unknown>)[VERCEL_CONTEXT] !== undefined;
}

export function createChatHandler(input: AideConfig, deps: ChatHandlerDeps = {}): ChatHandler {
	const config = resolveConfig(input);
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
	const siteMap = createSiteMap({ reader, transport, cache, config, now });
	const bodySchema = createBodySchema(limits);
	const provider = displayName(config, row);

	let checkedPlatform = false;
	/**
	 * Deferred to the first request, since only a request shows the platform. The library reads no
	 * environment variable, so `isLikelyServerless()` gets no env and the signal is the request's
	 * `platform` (Cloudflare, Netlify) or a live Vercel request context.
	 */
	function platformWarnings(event: RequestEvent): void {
		if (checkedPlatform) return;
		checkedPlatform = true;
		if (!isLikelyServerless() && !platformDetected(event)) return;
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

	async function warmup(event: RequestEvent, waitUntil: WaitUntil): Promise<Response> {
		const route = acceptRoute(event.url.searchParams.get('route'), { origin, exclude });
		if (route === null) return refuse('invalid_request', waitUntil, null, { path: 'route' });
		siteMap.ensureStarted(waitUntil);
		const entry = await reader.readPage(route, { waitUntil });
		const wantsDom =
			config.pageContext === 'dom' || (config.pageContext === 'auto' && (!entry || entry.thin));
		const body: WarmupResponse = {
			pageSource: wantsDom ? 'dom' : 'server',
			suggestions: suggestionsFor(config, route),
			mapped: siteMap.isMapped(route),
			provider
		};
		return json(body);
	}

	/** The current page (spec §3.3 part 5, §3.6): DOM text only when the server would ask for it. */
	function currentPage(route: string, entry: PageEntry | null, dom: string | null) {
		const wantsDom =
			config.pageContext === 'dom' || (config.pageContext === 'auto' && (!entry || entry.thin));
		if (wantsDom && dom) return { route, title: entry?.title, text: dom };
		if (config.pageContext === 'dom') return null;
		return entry ? { route, title: entry.title, text: entry.text } : null;
	}

	async function chat(event: RequestEvent, waitUntil: WaitUntil, id: string, started: number): Promise<Response> {
		let raw: unknown;
		try {
			raw = await event.request.json();
		} catch {
			return refuse('invalid_request', waitUntil, null, { path: '' });
		}
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
		const page = currentPage(route, entry, body.aide.dom);

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

		const result = streamText({
			model: model.model,
			instructions: prompt.instructions,
			messages: prompt.messages,
			tools,
			stopWhen: isStepCount(limits.maxSteps),
			maxOutputTokens: limits.maxOutputTokens,
			telemetry: { isEnabled: false },
			onError: ({ error }) => reportError(error),
			onEnd: (e) => {
				const tokens = (e.usage.inputTokens ?? 0) + (e.usage.outputTokens ?? 0);
				const charge = guards.charge(id, tokens).catch((error: unknown) => reportError(error));
				waitUntil(charge);
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
		const consumed = Promise.resolve(result.consumeStream()).catch(() => {});
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
			buffered.push(next.value);
			if (!PREAMBLE.has(next.value.type)) break;
		}

		const stream = new ReadableStream<TextStreamPart<ToolSet>>({
			start(controller) {
				for (const part of buffered) controller.enqueue(part);
			},
			async pull(controller) {
				const next = await source.read();
				if (next.done) controller.close();
				else controller.enqueue(next.value);
			},
			cancel(reason) {
				return source.cancel(reason);
			}
		});

		return createUIMessageStreamResponse({
			stream: toUIMessageStream({
				stream,
				tools,
				onError: () => REFUSAL_MESSAGES.provider_error,
				messageMetadata: ({ part }) => (part.type === 'finish' ? { usage: pickUsage(part.totalUsage) } : undefined)
			})
		});
	}

	const handler = (async (event: RequestEvent): Promise<Response> => {
		const started = now();
		transport.setInProcessFetch(event.fetch, event.url.origin);
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
	}) as ChatHandler;

	handler.config = config;
	handler.siteMap = siteMap;
	handler.transport = transport;
	handler.reader = reader;
	handler.cache = cache;
	handler.ready = ready;
	return handler;
}
