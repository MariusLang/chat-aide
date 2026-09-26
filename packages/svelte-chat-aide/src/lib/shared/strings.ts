import type { ErrorCode } from './types';

/** Sentences the server sends with each refusal (`{ error, message }`). Opaque by design. */
export const REFUSAL_MESSAGES: Record<ErrorCode, string> = {
	invalid_request: 'The request was not valid.',
	origin_refused: 'This chat only answers requests from its own site.',
	rate_limited: 'Too many messages in a short time. Please wait a few minutes and try again.',
	budget_exhausted: 'The chat has reached its usage limit for today. Please try again tomorrow.',
	unauthorized: 'You are not allowed to use this chat.',
	provider_error: 'The assistant could not answer just now. Please try again.',
	method_not_allowed: 'This method is not allowed.'
};

export interface AideStrings {
	greeting: string;
	placeholder: string;
	send: string;
	stop: string;
	retry: string;
	open: string;
	close: string;
	title: string;
	disclosure: (provider: string) => string;
	copy: string;
	copied: string;
	errors: Record<ErrorCode | 'network', string>;
}

/** Every visible string of the widget (spec §3.8); override any subset for translation. */
export const DEFAULT_STRINGS: AideStrings = {
	greeting: 'Hi! Ask me anything about this site.',
	placeholder: 'Ask a question…',
	send: 'Send',
	stop: 'Stop',
	retry: 'Retry',
	open: 'Open chat',
	close: 'Close chat',
	title: 'Chat',
	disclosure: (provider: string) =>
		`Messages and this page's route are sent to this site and to ${provider} to answer.`,
	copy: 'Copy',
	copied: 'Copied',
	errors: {
		...REFUSAL_MESSAGES,
		network: 'Could not reach the chat. Check your connection and try again.'
	}
};

export type Strings = typeof DEFAULT_STRINGS;
