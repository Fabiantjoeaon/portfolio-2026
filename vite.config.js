import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';

export default defineConfig( {
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
			}
		],
		// CRITICAL: Force single instance of Three.js to prevent duplicate currentStack
		dedupe: [ 'three' ],
	},
	build: {
		// Disable minification to prevent breaking Three.js TSL
		minify: false,
		rollupOptions: {
			// CRITICAL: Deduplicate Three.js modules in build
			dedupe: [ 'three', 'three/tsl', 'three/webgpu' ],
		},
	},
	worker: {
		format: 'es',
	},
} );
