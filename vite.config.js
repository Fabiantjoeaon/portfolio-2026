import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';
import { threeBlocks } from 'three-blocks/vite';
import { saveParamsPlugin } from './vite/saveParamsPlugin.js';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig( ( { mode } ) => ( {
	plugins: [
		saveParamsPlugin(),
		// Manifests are committed (`npm run shaders:capture`); stale ones fall back to live TSL.
		threeBlocks( {
			codecs: false,
			stats: false,
			text: false,
			overlay: false,
			renderer: { owner: 'worker' },
			shaders: { capture: false, strict: mode === 'strict' },
		} ),
		// navigator.gpu only exists in secure contexts, so LAN devices need https.
		mode === 'lan' && basicSsl(),
	],
	server: {
		port: 4000,
		headers: {
			'Cross-Origin-Opener-Policy': 'same-origin',
			'Cross-Origin-Embedder-Policy': 'require-corp',
		  },
	},
	resolve: {
		alias: [
			{
				find: '@',
				replacement: fileURLToPath( new URL( './src', import.meta.url ) ),
			},
		],
		// CRITICAL: Force single instance of Three.js to prevent duplicate currentStack
		dedupe: [ 'three' ],
	},
	build: {
		// Disable minification to prevent breaking Three.js TSL
		minify: false,
	},
	worker: {
		format: 'es',
		// Vite forces preserveEntrySignatures=false after spreading worker
		// rollupOptions, so use an options hook to retain the entry facade.
		// This prevents the lazy site chunk from importing TSL state back
		// from the worker entry, which WebKit can evaluate twice.
		plugins: () => [ {
			name: 'worker-entry-facade',
			options: options => ( { ...options, preserveEntrySignatures: 'strict' } ),
		} ],
	},
} ) );
