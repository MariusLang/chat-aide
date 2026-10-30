# @chat-aide/react

The chat-aide widget for React: a floating chat that answers from your own site's pages. Pair it
with a server: [`@chat-aide/next`](../next) on Next.js, or `createAide` from
[`@chat-aide/core`](../core) on any framework with web-standard `Request` / `Response`.

```sh
pnpm add @chat-aide/react
```

```tsx
'use client';
import { ChatWidget } from '@chat-aide/react';
import '@chat-aide/react/plain.css';

export function Chat() {
	return <ChatWidget suggestions={['How do I get started?']} />;
}
```

- `<ChatWidget>`: launcher and window, plain theme by default (`theme={null}` for none).
- `useAide(options)`: the chat state, for your own UI.
- `ChatWindow`, `ChatLauncher`, `Transcript`, `Message`, `Markdown`, `Composer`: the headless
  parts, with the same `data-part` structure as the Svelte widgets.

Answers render as a safe element tree: no HTML string, no images, and only same-origin links
unless `answerLinks="any"`.

Docs: [Next.js and React](../../docs/nextjs.md), [Theming](../../docs/theming.md).

MIT licence.
