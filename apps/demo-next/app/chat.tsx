'use client';
import { ChatWidget } from '@chat-aide/react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function Chat() {
	const pathname = usePathname();
	const router = useRouter();
	// Lets the Playwright suite wait for hydration.
	useEffect(() => document.documentElement.setAttribute('data-hydrated', ''), []);
	return <ChatWidget pathname={pathname} navigate={(href) => router.push(href)} />;
}
