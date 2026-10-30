export const metadata = { title: 'Install', description: 'How to add chat-aide to a Next.js site.' };

export default function Install() {
	return (
		<>
			<h1>Install</h1>
			<p>Add the packages with pnpm add @chat-aide/next @chat-aide/react, then mount the route handlers.</p>
			<p>Create lib/aide.ts with createAide, export its chat handlers from app/api/chat/route.ts, and render the ChatWidget in the root layout.</p>
		</>
	);
}
