import { chatConfigured } from '$lib/server/aide';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => ({ chat: chatConfigured() });
