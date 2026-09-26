const seen = new Set<string>();

/** Creation-time warning, printed once per distinct message. The only logger in the library. */
export function warn(message: string): void {
	if (seen.has(message)) return;
	seen.add(message);
	console.warn('[svelte-chat-aide] ' + message);
}
