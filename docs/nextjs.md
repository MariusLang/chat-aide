# Next.js and React

`@chat-aide/next` mounts the chat endpoint and `llms.txt` as App Router route handlers, and
`@chat-aide/react` is the widget. Both sit on `@chat-aide/core`, the same server the SvelteKit
package uses, so every option in [Configuration](configuration.md) and every provider in
[Providers](providers.md) works here too.

## 1. Install

```sh
pnpm add @chat-aide/next @chat-aide/react
```

Next.js 15.1 or newer, React 18 or 19, Node 24+. The AI SDK and every provider adapter come with
`@chat-aide/core`.

## 2. Create the handler

```ts
// lib/aide.ts
import { createAide, fromEnv } from '@chat-aide/next';

export const aide = createAide(() => ({
	provider: fromEnv(process.env),
	origin: process.env.SITE_ORIGIN // e.g. https://example.com, or http://localhost:3000 in dev
}));
```

Pass the config as a function: `next build` evaluates route modules without your run-time
environment, and `fromEnv` would throw there. The function runs once, on the first request. A
plain object works too when it needs nothing from the environment.

`origin` is required. Next.js has no hook that could pass the library's own reads of your pages
through in process, so the server reads them over the network from `origin`, anonymously, as a
visitor would (see [Deployment → origin](deployment.md#origin)).

Keep the core out of the server bundle, since it loads the provider's adapter at run time:

```js
// next.config.mjs
export default {
	serverExternalPackages: ['@chat-aide/core']
};
```

## 3. Mount the routes

```ts
// app/api/chat/route.ts
import { aide } from '@/lib/aide';
export const { GET, POST } = aide.chat;
```

```ts
// app/llms.txt/route.ts
import { aide } from '@/lib/aide';
export const { GET, HEAD } = aide.llmsTxt;
```

```ts
// app/llms-full.txt/route.ts
import { aide } from '@/lib/aide';
export const { GET, HEAD } = aide.llmsFullTxt;
```

The two `llms` routes are optional. The `<route>.md` twins are not served on Next.js yet; the
crawler reads your HTML instead.

## 4. Add the widget

```tsx
// app/chat.tsx
'use client';
import { ChatWidget } from '@chat-aide/react';
import { usePathname, useRouter } from 'next/navigation';

export function Chat() {
	const pathname = usePathname();
	const router = useRouter();
	return <ChatWidget pathname={pathname} navigate={(href) => router.push(href)} />;
}
```

```tsx
// app/layout.tsx
import '@chat-aide/react/plain.css';
import { Chat } from './chat';

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>
				{children}
				<Chat />
			</body>
		</html>
	);
}
```

`pathname` lets the widget warm up the new page after a client-side navigation, and `navigate`
makes same-origin links in answers use the router instead of a full page load.

## The React widget

`<ChatWidget>` takes the same options as the Svelte widget ([Theming](theming.md#chatwidget-props)):
`endpoint`, `position`, `offset`, `mode`, `enabled`, `suggestions`, `strings`, `disclosure`,
`persistThread`, `answerLinks` and the `onopen` … `onerror` callbacks. React-specific:

| prop | |
|---|---|
| `open`, `onOpenChange` | controlled open state |
| `launcher` | `({ open, toggle }) => ReactNode`, replaces the floating button |
| `pathname` | the current path from your router; a change while open warms the new page up |
| `navigate` | `(href) => void` for same-origin answer links |
| `theme` | `'plain'` (default) wraps the widget in the plain theme's root; `null` renders it bare |
| `colorScheme` | `'light'` or `'dark'` pins the plain theme; by default it follows `prefers-color-scheme` |
| `chat` | a state object from `useAide(options)`; the options above are then ignored |

The plain theme is the same stylesheet as the Svelte plain theme: every colour, radius and font is
an `--aide-*` custom property ([Theming → plain theme](theming.md#plain-theme)).

### Your own UI

`useAide(options)` returns the chat state (`messages`, `status`, `error`, `isOpen`,
`suggestions`, `strings`, `provider`, and `send`, `stop`, `retry`, `open`, `close`, `toggle`,
`warmup`). The parts `ChatWindow`, `ChatLauncher`, `Transcript`, `Message`, `Markdown` and
`Composer` render the same `data-part` structure as the Svelte headless components, so you can
style them yourself or mix them with your own.

```tsx
'use client';
import { ChatWindow, useAide } from '@chat-aide/react';

export function DocsChat() {
	const chat = useAide({ suggestions: ['How do I install it?'] });
	return <ChatWindow chat={chat} modal={false} />;
}
```

## Rate limits behind a proxy

The per-visitor rate limit and budget need the visitor's address. The adapter reads `x-real-ip`,
else the last `x-forwarded-for` entry, which Vercel and most proxies set. Without such a proxy
those headers are the client's to forge: pass your own with
`createAide(config, { clientAddress: (request) => … })`, or set `config.clientKey`. The site-wide
budget bounds your bill either way ([Security](security.md#it-is-callable-by-scripts)).

## Background work

The crawl, cache refreshes and server callbacks run after the response. The adapter hands them to
Next.js's `after()`, so they finish on Vercel and other serverless hosts too. Set
`config.waitUntil` to override it. On serverless, configure a shared `store` as well
([Deployment → shared store](deployment.md#shared-store)).
