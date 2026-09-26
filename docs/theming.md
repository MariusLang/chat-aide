# Theming and the widget

Three layers, each importable on its own:

| import | what |
|---|---|
| `svelte-chat-aide` or `svelte-chat-aide/themes/shadcn` | the default theme: shadcn-svelte components, precompiled Tailwind 4 styles |
| `svelte-chat-aide/themes/plain` | no dependencies, one stylesheet of `--aide-*` custom properties |
| `svelte-chat-aide/headless` | `createChat` and unstyled components with `data-part` attributes |
| `svelte-chat-aide/extract` | the page-text extractor (`extract(document)`), for a custom widget |

## `<ChatWidget>` props

Same props in every theme.

| prop | default | |
|---|---|---|
| `endpoint` | `'/api/chat'` | match `config.endpoint` |
| `position` | `'bottom-right'` | `bottom-left`, `top-right`, `top-left`; ignored with a `launcher` snippet |
| `offset` | theme default | `{ x?, y? }`, numbers are px, strings any CSS length (see [CSP](#csp)) |
| `mode` | `'floating'` | `'inline'` renders the window in the page flow (a docs column), `'sheet'` a side panel |
| `open` | `false` | bindable |
| `enabled` | `true` | `false` renders nothing (gate on consent) |
| `suggestions` | from the server | `string[]` or `{ [route]: string[], '*': string[] }`; up to four are shown |
| `strings` | English | any subset of `DEFAULT_STRINGS`, including `errors` and `disclosure(provider)` |
| `disclosure` | names the provider | the line under the composer; the default names the provider from the warm-up ("… sent to this site and to Anthropic …") |
| `persistThread` | `true` | keep the thread in the tab's `sessionStorage` |
| `answerLinks` | `'same-origin'` | or `'any'` ([Security](security.md#what-an-answer-may-render)) |
| `onopen`, `onclose`, `onsend(text)`, `onresponse(text, usage)`, `onerror(code)` | | client callbacks |
| `chat` | | a store from `createChat`; the options above are then ignored |
| `launcher` | | a snippet replacing the floating button |
| `class` | | on the root element |

The plain theme adds `nonce`, `theme` (`'light' | 'dark'`, pins the scheme) and `stylesheet`.

The same client events fire on `window` as `aide:open`, `aide:close`, `aide:send`, `aide:response`
and `aide:error` `CustomEvent`s, for tag managers.

```svelte
<ChatWidget>
	{#snippet launcher({ open, toggle })}
		<button onclick={toggle} aria-expanded={open}>Ask</button>
	{/snippet}
</ChatWidget>
```

Behaviour worth knowing:

- The thread lives in `sessionStorage` for the tab (with the random `sessionId`), and survives
  reloads. Only the request is trimmed: the widget sends at most the server's `limits.messages`
  and `messageChars` (learned from the warm-up), so a long conversation never becomes a `400`.
- Each open, and each client-side navigation while open, repeats the warm-up for the new route.
- The widget root carries `data-aide-ignore`, so its transcript never ends up in page text. Put
  the same attribute on any text your visitors write ([Security](security.md#prompt-injection)).
- Links in answers do not preload on hover; same-origin ones navigate with `goto` on click.
- The window is a `dialog` with a focus trap, `Escape` closes it, the transcript is `aria-live`,
  reduced motion is honoured, it is full screen under 480 px.

## shadcn theme (default)

Every colour reads the host's shadcn-svelte variables (`--background`, `--foreground`, `--card`,
`--primary`, `--muted`, `--border`, `--ring`, …) with a fallback, so on a shadcn-svelte site it
follows your theme and a `.dark` / `[data-theme="dark"]` ancestor, and elsewhere it uses its own
palette (dark from `prefers-color-scheme`). Utilities are compiled under Tailwind's `prefix(aide)`
into a stylesheet the components import: no `@source` line, no config, no collision with your
Tailwind, and nothing to do on a site without Tailwind. Also exported: `ChatWindow` (mount alone,
e.g. inline) and `ChatLauncher`.

## plain theme

```svelte
<script>
	import { ChatWidget } from 'svelte-chat-aide/themes/plain';
	let { data } = $props();
</script>

<ChatWidget nonce={data.cspNonce} />
```

The component injects its CSS in one `<style nonce>` in the head. To link it yourself instead:
`import 'svelte-chat-aide/themes/plain/plain.css'` and `stylesheet={false}`. Every colour, radius,
font and size is a `--aide-*` custom property set at zero specificity, so overriding is one rule:

```css
[data-aide-theme='plain'] {
	--aide-accent: rebeccapurple;
	--aide-radius: 8px;
	--aide-font: 'Inter', sans-serif;
}
```

Light by default; dark from `prefers-color-scheme` or `data-theme="dark"` on the root or any
ancestor (`data-theme="light"` pins light). `ChatWindow` defaults to `mode="inline"` for a docs
column.

## headless

```svelte
<script>
	import { createChat, ChatWidget, ChatWindow } from 'svelte-chat-aide/headless';
	const chat = createChat({ endpoint: '/api/chat' });
</script>

<ChatWidget {chat} />
```

`createChat(options)` is a runes store: `messages`, `status`, `error`, `isOpen`, `suggestions`,
`strings`, `route`, `provider`, `sessionId`, and `send`, `stop`, `retry`, `open`, `close`, `toggle`,
`warmup`. It takes the widget's non-visual options (`endpoint`, `persistThread`, `answerLinks`,
`strings`, `suggestions`, the callbacks, `fetch`). Also exported: `ChatLauncher`, `ChatWindow`,
`Transcript`, `Message`, `Markdown`, `MdInline`, `Composer`, `trapFocus`, `messageText`,
`DEFAULT_STRINGS`.

The components render no CSS. Style them by `data-part`:

`widget`, `launcher`, `window`, `header`, `title`, `close`, `transcript`, `greeting`,
`suggestions`, `suggestion`, `message`, `message-text`, `markdown`, `link`, `inline-code`, `code`,
`code-lang`, `copy`, `pending`, `status`, `error`, `retry`, `composer`, `input`, `send`, `stop`,
`disclosure`.

The widget root also carries `data-position`, `data-mode` and `data-open`, and sets
`--aide-offset-x` / `--aide-offset-y` from `offset`.

## CSP

No inline scripts in any theme. The shadcn theme's CSS is a regular imported stylesheet; the plain
theme's one `<style>` takes `nonce`. The `offset` prop is written as an inline `style` attribute
on the widget root, which a `style-src` without `'unsafe-inline'` blocks. Under such a policy leave
`offset` unset and set the properties from your stylesheet:

```css
[data-part='widget'] {
	--aide-offset-x: 24px;
	--aide-offset-y: 96px;
}
```
