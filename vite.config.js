import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';
import { saveParamsPlugin } from './vite/saveParamsPlugin.js';

export default defineConfig( {
	plugins: [ saveParamsPlugin() ],
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
			// three-blocks 0.12 dropped these from its public exports map,
			// but the compiled modules still ship in dist. Alias them until
			// the code is migrated to defineAssets / Baked Motion.
			{
				find: 'three-blocks-internal/gltf-curve-extension',
				replacement: fileURLToPath( new URL( './node_modules/three-blocks/dist/Addons/GLTFCurveExtension.mjs', import.meta.url ) ),
			},
			{
				find: 'three-blocks-internal/animation-bake-mixer',
				replacement: fileURLToPath( new URL( './node_modules/three-blocks/dist/Animation/AnimationBakeMixer.mjs', import.meta.url ) ),
			}
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
	},
} );
