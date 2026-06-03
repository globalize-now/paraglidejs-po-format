import type { Reroute } from '@sveltejs/kit';
import { deLocalizeUrl } from '$lib/paraglide/runtime';

// Strips the locale prefix (/de, /pl) so SvelteKit resolves the underlying route.
export const reroute: Reroute = (request) => deLocalizeUrl(request.url).pathname;
