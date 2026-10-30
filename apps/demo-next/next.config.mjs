/** @type {import('next').NextConfig} */
const nextConfig = {
	// The core loads the provider's AI SDK adapter with a dynamic import at run time: keep it a
	// Node package instead of bundling it.
	serverExternalPackages: ['@chat-aide/core']
};

export default nextConfig;
