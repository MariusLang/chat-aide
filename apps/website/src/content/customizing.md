# Customizing

Everything below is optional. The defaults give a working chat; this page shows the knobs you
are most likely to turn, from the server prompt to a widget you build yourself. The full lists are
in [Configuration](configuration.md) and [Theming](theming.md).

The server options are the same on every framework: pass them to `aide()` on SvelteKit, or to
`createAide()` on Next.js and elsewhere. The widget examples are Svelte; the React
`<ChatWidget>` takes the same props (see [Next.js and React](nextjs.md#the-react-widget)).

## Shape the answers

The server assembles the prompt from your system prompt, a persona, extra facts and the site
outline. Change any of them in the `aide()` config:

```ts
// src/hooks.server.ts
import { aide } from '@chat-aide/sveltekit/server';

export const handle = aide({
	provider,
	origin: env.ORIGIN,
	persona: {
		name: 'Pip',
		tone: 'friendly and brief',
		audience: 'developers evaluating the product',
		language: 'English',
		refusals: ['legal advice', 'questions about competitors']
	},
	facts: ['Support is at help@example.com.', 'The free plan has 3 seats.']
});
```

- `persona` is rendered under the system prompt.
- `facts` carries things your pages do not say: prices, contact addresses, opening hours.
- `systemPrompt` replaces the default entirely. Pass a string, or a function that receives
  `{ route, site, persona }`. Keep its output stable between requests, or the provider's prompt
  cache cannot be reused ([Configuration → the prompt](configuration.md#the-prompt-and-when-it-caches)).

## Choose what it reads

```ts
aide({
	provider,
	pages: {
		include: ['/changelog'],             // extra crawl seeds
		exclude: ['/admin/**', '/drafts/*']  // never read, mapped or served
	}
});
```

The crawl starts at the root, follows links, and reads your `/sitemap.xml` and `/llms.txt` if
you have them. If your `llms.txt` lists pages, its order becomes the outline's order. For content
in a CMS, return pages yourself with `pages.source` ([Configuration](configuration.md#pagessource)).

To keep part of a page out, such as comments or reviews, put `data-aide-ignore` on its element. Do
this for all visitor-written text ([Security → prompt injection](security.md#prompt-injection)).

## Suggest first questions

Suggestions appear as buttons before the first message. Set them on the server, per route:

```ts
aide({
	provider,
	suggestions: {
		'*': ['What does this site do?', 'How do I get started?'],
		'/pricing': ['Is there a free plan?']
	}
});
```

or on the widget with the same shape: `<ChatWidget suggestions={['…']} />`. Up to four are shown.

## Change the words

Every string of the widget can be replaced, in any language:

```svelte
<ChatWidget
	strings={{
		title: 'Ask the docs',
		greeting: 'Hi! What are you building?',
		placeholder: 'Type a question…',
		disclosure: (provider) => `Your question is sent to ${provider}.`
	}}
/>
```

The keys are `greeting`, `placeholder`, `send`, `stop`, `retry`, `open`, `close`, `title`,
`disclosure`, `copy`, `copied` and `errors`.

## Restyle the widget

- **shadcn theme** (default): it reads your `--background`, `--primary`, `--border` and other
  shadcn variables, and follows `.dark`. Change your theme and the widget follows. This site does
  exactly that.
- **plain theme**: override `--aide-*` custom properties in one rule.
- **placement**: `position` (`bottom-right`, `bottom-left`, `top-right`, `top-left`), `offset`,
  and `mode`: `floating`, `inline` (in the page flow, e.g. a docs column) or `sheet` (a side panel).

```css
[data-aide-theme='plain'] {
	--aide-accent: rebeccapurple;
	--aide-radius: 8px;
}
```

## Bring your own launcher

Replace the floating button with anything, for example a button in your header:

```svelte
<ChatWidget>
	{#snippet launcher({ open, toggle })}
		<button onclick={toggle} aria-expanded={open}>Ask AI</button>
	{/snippet}
</ChatWidget>
```

## Build your own widget

The headless layer gives you the store and unstyled parts. Each part carries a `data-part`
attribute to style against:

```svelte
<script>
	import { createChat, ChatWindow } from '@chat-aide/sveltekit/headless';
	const chat = createChat({ endpoint: '/api/chat' });
</script>

<button onclick={() => chat.toggle()}>Chat</button>
{#if chat.isOpen}
	<ChatWindow {chat} />
{/if}
```

`createChat` exposes `messages`, `status`, `suggestions`, `send`, `stop`, `retry`, `open`, `close`
and more. See [Theming → headless](theming.md#headless).

## React to events

Client callbacks (`onopen`, `onsend`, `onresponse`, `onerror`, …) and matching `aide:*` window
events feed analytics. Server callbacks (`onMessage`, `onResponse`, `onRefused`, `onError`) run
after the response and never delay it; use them for logging and usage reports.

## Gate access

`authorize(event)` runs before each chat request. Return `false` to refuse, or a `Response` of your
own. Combine it with `enabled={false}` on the widget to hide the chat until a visitor consents or
signs in.
