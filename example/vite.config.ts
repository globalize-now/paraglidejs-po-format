import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		// Loads the PO-format plugin from its deployed npm artifact (via the CDN URL
		// in project.inlang/settings.json), imports the .po files, and compiles them
		// into type-safe message functions in src/lib/paraglide.
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['url', 'cookie', 'baseLocale'],
			urlPatterns: [
				{
					pattern: '/:path(.*)?',
					localized: [
						// The base-locale catch-all pattern matches everything, so it MUST
						// come last — otherwise it would also swallow /de and /pl.
						['de', '/de/:path(.*)?'],
						['pl', '/pl/:path(.*)?'],
						['en', '/:path(.*)?']
					]
				}
			]
		}),
		sveltekit()
	]
});
