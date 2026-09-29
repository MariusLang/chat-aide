import '@chat-aide/react/plain.css';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Chat } from './chat';

export const metadata = { title: 'Aide on Next.js', description: 'A Next.js site using chat-aide.' };

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<body style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '0 auto', padding: 24 }}>
				<nav style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
					<Link href="/">Home</Link>
					<Link href="/pricing">Pricing</Link>
					<Link href="/docs/install">Install</Link>
				</nav>
				<main>{children}</main>
				<Chat />
			</body>
		</html>
	);
}
