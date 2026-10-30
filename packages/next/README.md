# @chat-aide/next

Next.js App Router adapter for chat-aide: the chat endpoint and `llms.txt` as route handlers. Use
it with the [`@chat-aide/react`](../react) widget.

```sh
pnpm add @chat-aide/next @chat-aide/react
```

```ts
// lib/aide.ts
import { createAide, fromEnv } from '@chat-aide/next';
export const aide = createAide(() => ({ provider: fromEnv(process.env), origin: process.env.SITE_ORIGIN }));

// app/api/chat/route.ts
export const { GET, POST } = aide.chat;

// app/llms.txt/route.ts
export const { GET, HEAD } = aide.llmsTxt;
```

```js
// next.config.mjs
export default { serverExternalPackages: ['@chat-aide/core'] };
```

Background work goes to Next.js's `after()`. The site is read over the network from `origin`,
which is required.

Full guide: [Next.js and React](../../docs/nextjs.md).

MIT licence.
