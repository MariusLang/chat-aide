'use client';
import { ChatWidget } from '@chat-aide/react';
import { usePathname, useRouter } from 'next/navigation';

export function Chat() {
	const pathname = usePathname();
	const router = useRouter();
	return <ChatWidget pathname={pathname} navigate={(href) => router.push(href)} />;
}
