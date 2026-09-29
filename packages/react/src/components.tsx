'use client';
/**
 * The React widget, headless: the same elements and `data-part` attributes as the Svelte
 * headless layer, so the plain theme's stylesheet (`@chat-aide/react/plain.css`) styles both.
 * Answers render through `parseAnswer`: a safe node tree, never an HTML string, never an image.
 */
import {
	DEFAULT_STRINGS,
	LIMIT_DEFAULTS,
	messageText,
	parseAnswer,
	trapFocus,
	type AnswerLinks,
	type MdBlock,
	type MdInline,
	type Strings,
	type Suggestions,
	type Usage,
	type WidgetMode,
	type WidgetPosition
} from '@chat-aide/core/client';
import type { UIMessage } from 'ai';
import {
	createElement,
	useEffect,
	useId,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent,
	type MouseEvent,
	type ReactNode
} from 'react';
import { useAide, type AideChat } from './use-aide.js';

/** Called for a click on a same-origin answer link; the default is a normal navigation. */
export type Navigate = (href: string) => void;

// ---------------------------------------------------------------------------------------------
// Markdown

function Inline({ nodes, navigate }: { nodes: MdInline[]; navigate?: Navigate }): ReactNode {
	return nodes.map((node, i) => {
		switch (node.t) {
			case 'text':
				return node.v;
			case 'code':
				return (
					<code key={i} data-part="inline-code">
						{node.v}
					</code>
				);
			case 'em':
				return (
					<em key={i}>
						<Inline nodes={node.c} navigate={navigate} />
					</em>
				);
			case 'strong':
				return (
					<strong key={i}>
						<Inline nodes={node.c} navigate={navigate} />
					</strong>
				);
			case 'del':
				return (
					<del key={i}>
						<Inline nodes={node.c} navigate={navigate} />
					</del>
				);
			case 'br':
				return <br key={i} />;
			case 'link':
				if (node.external) {
					return (
						<a key={i} data-part="link" data-external="" href={node.href} target="_blank" rel="noopener noreferrer">
							<Inline nodes={node.c} navigate={navigate} />
						</a>
					);
				}
				return (
					<a
						key={i}
						data-part="link"
						href={node.href}
						onClick={(event: MouseEvent) => {
							if (!navigate || event.defaultPrevented || event.button !== 0) return;
							if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
							event.preventDefault();
							navigate(node.href);
						}}
					>
						<Inline nodes={node.c} navigate={navigate} />
					</a>
				);
		}
	});
}

function CodeBlock({ lang, value, strings }: { lang?: string; value: string; strings: Pick<Strings, 'copy' | 'copied'> }) {
	const [copied, setCopied] = useState(false);
	useEffect(() => {
		if (!copied) return;
		const t = setTimeout(() => setCopied(false), 1500);
		return () => clearTimeout(t);
	}, [copied]);
	return (
		<div data-part="code" data-lang={lang}>
			{lang && <span data-part="code-lang">{lang}</span>}
			<button
				type="button"
				data-part="copy"
				onClick={() => {
					navigator.clipboard.writeText(value).then(
						() => setCopied(true),
						() => {}
					);
				}}
			>
				{copied ? strings.copied : strings.copy}
			</button>
			<pre>
				<code>{value}</code>
			</pre>
		</div>
	);
}

function Blocks({
	list,
	strings,
	navigate
}: {
	list: MdBlock[];
	strings: Pick<Strings, 'copy' | 'copied'>;
	navigate?: Navigate;
}): ReactNode {
	return list.map((block, i) => {
		switch (block.t) {
			case 'p':
				return (
					<p key={i}>
						<Inline nodes={block.c} navigate={navigate} />
					</p>
				);
			case 'h':
				return createElement(`h${block.level}`, { key: i }, <Inline nodes={block.c} navigate={navigate} />);
			case 'list': {
				const items = block.items.map((item, j) => (
					<li key={j}>
						<Blocks list={item} strings={strings} navigate={navigate} />
					</li>
				));
				return block.ordered ? (
					<ol key={i} start={block.start}>
						{items}
					</ol>
				) : (
					<ul key={i}>{items}</ul>
				);
			}
			case 'code':
				return <CodeBlock key={i} lang={block.lang} value={block.v} strings={strings} />;
			case 'quote':
				return (
					<blockquote key={i}>
						<Blocks list={block.c} strings={strings} navigate={navigate} />
					</blockquote>
				);
			case 'hr':
				return <hr key={i} />;
		}
	});
}

export interface MarkdownProps {
	text: string;
	answerLinks?: AnswerLinks;
	/** Origin for same-origin links (default `location.origin`). */
	origin?: string;
	strings?: Pick<Strings, 'copy' | 'copied'>;
	navigate?: Navigate;
	className?: string;
}

/** An answer's markdown as React elements. */
export function Markdown({ text, answerLinks = 'same-origin', origin, strings = DEFAULT_STRINGS, navigate, className }: MarkdownProps) {
	const tree = parseAnswer(text, {
		origin: origin ?? (typeof location === 'undefined' ? 'http://aide.internal' : location.origin),
		answerLinks
	});
	return (
		<div data-part="markdown" className={className}>
			<Blocks list={tree} strings={strings} navigate={navigate} />
		</div>
	);
}

// ---------------------------------------------------------------------------------------------
// Parts

export function Message({
	message,
	streaming = false,
	answerLinks = 'same-origin',
	strings = DEFAULT_STRINGS,
	navigate
}: {
	message: UIMessage;
	streaming?: boolean;
	answerLinks?: AnswerLinks;
	strings?: Strings;
	navigate?: Navigate;
}) {
	const text = messageText(message);
	return (
		<div
			data-part="message"
			data-role={message.role}
			data-streaming={streaming ? '' : undefined}
			aria-busy={streaming ? 'true' : undefined}
		>
			{message.role === 'assistant' ? (
				<Markdown text={text} answerLinks={answerLinks} strings={strings} navigate={navigate} />
			) : (
				<p data-part="message-text">{text}</p>
			)}
		</div>
	);
}

/** Greeting and suggestions when empty, the messages, the error with a retry, a status node. */
export function Transcript({ chat, navigate }: { chat: AideChat; navigate?: Navigate }) {
	const visible = chat.messages.filter((m) => m.role === 'user' || m.role === 'assistant');
	const busy = chat.status === 'submitted' || chat.status === 'streaming';
	const node = useRef<HTMLDivElement>(null);
	const previous = useRef(chat.status);
	const [announcement, setAnnouncement] = useState('');

	useEffect(() => {
		if (previous.current === 'streaming' && chat.status === 'ready') {
			const last = chat.messages.at(-1);
			if (last?.role === 'assistant') setAnnouncement(messageText(last));
		}
		previous.current = chat.status;
	}, [chat.status, chat.messages]);

	const last = chat.messages.at(-1);
	useEffect(() => {
		// Follow the newest text while it streams.
		const el = node.current;
		if (el && typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight });
	}, [chat.messages.length, last?.parts.length, last]);

	return (
		<>
			<div data-part="transcript" aria-live="polite" ref={node}>
				{visible.length === 0 && (
					<>
						<p data-part="greeting">{chat.strings.greeting}</p>
						{chat.suggestions.length > 0 && (
							<ul data-part="suggestions">
								{chat.suggestions.map((s) => (
									<li key={s}>
										<button type="button" data-part="suggestion" onClick={() => void chat.send(s)}>
											{s}
										</button>
									</li>
								))}
							</ul>
						)}
					</>
				)}
				{visible.map((message, i) => (
					<Message
						key={message.id}
						message={message}
						streaming={busy && i === visible.length - 1 && message.role === 'assistant'}
						answerLinks={chat.answerLinks}
						strings={chat.strings}
						navigate={navigate}
					/>
				))}
				{chat.status === 'submitted' && <div data-part="pending" aria-hidden="true" />}
				{chat.error && (
					<div data-part="error" role="alert" data-code={chat.error.code}>
						<p>{chat.error.message}</p>
						<button type="button" data-part="retry" onClick={() => void chat.retry()}>
							{chat.strings.retry}
						</button>
					</div>
				)}
			</div>
			<div data-part="status" role="status" aria-live="polite">
				{announcement}
			</div>
		</>
	);
}

/** The message field with send and stop. Enter sends, Shift+Enter adds a line. */
export function Composer({ chat, maxLength = LIMIT_DEFAULTS.messageChars }: { chat: AideChat; maxLength?: number }) {
	const [value, setValue] = useState('');
	const busy = chat.status === 'submitted' || chat.status === 'streaming';

	function submit(event?: { preventDefault(): void }) {
		event?.preventDefault();
		if (busy || !value.trim()) return;
		const text = value;
		setValue('');
		void chat.send(text);
	}

	return (
		<form data-part="composer" onSubmit={submit}>
			<textarea
				data-part="input"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
					if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
				}}
				maxLength={maxLength}
				rows={1}
				placeholder={chat.strings.placeholder}
				aria-label={chat.strings.placeholder}
			/>
			{busy ? (
				<button type="button" data-part="stop" onClick={() => chat.stop()}>
					{chat.strings.stop}
				</button>
			) : (
				<button type="submit" data-part="send" disabled={!value.trim()}>
					{chat.strings.send}
				</button>
			)}
		</form>
	);
}

/** The floating button that opens the chat. */
export function ChatLauncher({ chat, controls, children }: { chat: AideChat; controls?: string; children?: ReactNode }) {
	return (
		<button
			type="button"
			data-part="launcher"
			aria-label={chat.strings.open}
			aria-expanded={chat.isOpen}
			aria-controls={controls}
			aria-haspopup="dialog"
			onClick={() => chat.toggle()}
		>
			{children ?? chat.strings.open}
		</button>
	);
}

export interface ChatWindowProps {
	chat: AideChat;
	id?: string;
	/** A modal dialog (focus trap, Escape closes) or, with `false`, a plain region. */
	modal?: boolean;
	/** The line under the composer saying where messages go. */
	disclosure?: string;
	navigate?: Navigate;
	className?: string;
}

/** Header, transcript, composer and disclosure. */
export function ChatWindow({ chat, id, modal = true, disclosure, navigate, className }: ChatWindowProps) {
	const uid = useId();
	const windowId = id ?? `aide-window-${uid}`;
	const titleId = `aide-title-${uid}`;
	const node = useRef<HTMLElement>(null);
	const line = disclosure ?? chat.strings.disclosure(chat.provider ?? "the site's AI provider");

	useEffect(() => {
		if (!node.current) return;
		const trap = trapFocus(node.current, { enabled: modal, initial: '[data-part="input"]' });
		return () => trap.destroy();
	}, [modal]);

	return (
		<section
			id={windowId}
			ref={node}
			data-aide-ignore=""
			data-part="window"
			data-modal={modal ? '' : undefined}
			role={modal ? 'dialog' : 'region'}
			aria-modal={modal ? 'true' : undefined}
			aria-labelledby={titleId}
			className={className}
			onKeyDown={(event) => {
				if (modal && event.key === 'Escape') {
					event.preventDefault();
					event.stopPropagation();
					chat.close();
				}
			}}
		>
			<header data-part="header">
				<h2 data-part="title" id={titleId}>
					{chat.strings.title}
				</h2>
				{modal && (
					<button type="button" data-part="close" aria-label={chat.strings.close} onClick={() => chat.close()}>
						×
					</button>
				)}
			</header>
			<Transcript chat={chat} navigate={navigate} />
			<Composer chat={chat} />
			{line && <p data-part="disclosure">{line}</p>}
		</section>
	);
}

// ---------------------------------------------------------------------------------------------
// The widget

export interface ChatWidgetProps {
	endpoint?: string;
	position?: WidgetPosition;
	offset?: { x?: number | string; y?: number | string };
	mode?: WidgetMode;
	/** Controlled open state; pair with `onOpenChange`. */
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	/** `false` renders nothing (gate on consent). */
	enabled?: boolean;
	suggestions?: Suggestions;
	strings?: Partial<Strings>;
	disclosure?: string;
	persistThread?: boolean;
	answerLinks?: AnswerLinks;
	onopen?: () => void;
	onclose?: () => void;
	onsend?: (text: string) => void;
	onresponse?: (text: string, usage?: Usage) => void;
	onerror?: (code: string) => void;
	fetch?: typeof fetch;
	/** A chat made with `useAide`; the options above are then ignored. */
	chat?: AideChat;
	/** Replaces the default launcher; `position` is then ignored. */
	launcher?: (state: { open: boolean; toggle: () => void }) => ReactNode;
	/**
	 * The current pathname, from your router (`usePathname()` in Next.js). When it changes while
	 * the chat is open, the widget warms the new page up, as the Svelte widget does on navigation.
	 */
	pathname?: string;
	/** Client-side navigation for same-origin answer links (`router.push` in Next.js). */
	navigate?: Navigate;
	/** `'plain'` (default) wraps the widget in the plain theme's root; `null` renders it bare. */
	theme?: 'plain' | null;
	/** With the plain theme: pins light or dark; by default it follows `prefers-color-scheme`. */
	colorScheme?: 'light' | 'dark';
	className?: string;
}

const px = (v: number | string | undefined): string | undefined =>
	v === undefined ? undefined : typeof v === 'number' ? `${v}px` : v;

/** The launcher and the window. Import `@chat-aide/react/plain.css` once for the plain theme. */
export function ChatWidget(props: ChatWidgetProps) {
	const own = useAide({
		endpoint: props.endpoint,
		persistThread: props.persistThread,
		answerLinks: props.answerLinks,
		strings: props.strings,
		suggestions: props.suggestions,
		fetch: props.fetch,
		onopen: () => props.onopen?.(),
		onclose: () => props.onclose?.(),
		onsend: (text) => props.onsend?.(text),
		onresponse: (text, usage) => props.onresponse?.(text, usage),
		onerror: (code) => props.onerror?.(code)
	});
	const chat = props.chat ?? own;
	const { mode = 'floating', position = 'bottom-right', enabled = true, theme = 'plain' } = props;
	const inline = mode === 'inline';
	const uid = useId();
	const windowId = `aide-window-${uid}`;

	// open prop -> chat
	useEffect(() => {
		if (!enabled || props.open === undefined) return;
		if (props.open && !chat.isOpen) chat.open();
		else if (!props.open && chat.isOpen) chat.close();
		// Only when the prop changes.
	}, [props.open, enabled]);

	// chat -> onOpenChange
	const reported = useRef(chat.isOpen);
	useEffect(() => {
		if (reported.current === chat.isOpen) return;
		reported.current = chat.isOpen;
		props.onOpenChange?.(chat.isOpen);
	}, [chat.isOpen]);

	// A new page while open: warm it up.
	const first = useRef(true);
	useEffect(() => {
		if (first.current) {
			first.current = false;
			return;
		}
		if (props.pathname && enabled && (chat.isOpen || inline)) void chat.warmup(props.pathname);
	}, [props.pathname]);

	if (!enabled) return null;

	const style = { '--aide-offset-x': px(props.offset?.x), '--aide-offset-y': px(props.offset?.y) } as CSSProperties;
	const widget = (
		<div
			data-aide-ignore=""
			data-part="widget"
			data-position={props.launcher ? undefined : position}
			data-mode={mode}
			data-open={chat.isOpen ? '' : undefined}
			className={props.className}
			style={style}
		>
			{!inline &&
				(props.launcher ? (
					props.launcher({ open: chat.isOpen, toggle: chat.toggle })
				) : (
					<ChatLauncher chat={chat} controls={windowId} />
				))}
			{(inline || chat.isOpen) && (
				<ChatWindow chat={chat} id={windowId} modal={!inline} disclosure={props.disclosure} navigate={props.navigate} />
			)}
		</div>
	);

	return theme === 'plain' ? (
		<div data-aide-ignore="" data-aide-theme="plain" data-theme={props.colorScheme}>
			{widget}
		</div>
	) : (
		widget
	);
}
