import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';
import { threeBlocks } from 'three-blocks/vite';
import { saveParamsPlugin } from './vite/saveParamsPlugin.js';
import { seoPlugin } from './vite/seoPlugin.js';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { FONTS, fontMime } from './src/shared/fonts.js';

const fontPreload = () => ( {
	name: 'font-preload',
	transformIndexHtml: () => [
		`${ FONTS.sans.dir }/${ FONTS.sans.faces[ FONTS.sans.preload ] }`,
		FONTS.mono.file,
	].map( href => ( {
		tag: 'link',
		attrs: { rel: 'preload', href: `/${ href }`, as: 'font', type: fontMime( href ), crossorigin: '' },
		injectTo: 'head-prepend',
	} ) ),
} );

// The offscreen worker only starts once the GPU benchmark has picked a tier,
// so init prefetches its boot chunks (fetched, not evaluated) meanwhile. They
// sit in a template so they don't compete with the main bundle's download.
const workerPrefetch = () => {

	const files = new Set();
	let base = '/';
	const collect = {
		name: 'worker-prefetch-collect',
		generateBundle( _, bundle ) {

			const chunks = Object.values( bundle ).filter( chunk => chunk.type === 'chunk' );
			const roots = [
				chunks.find( chunk => chunk.isEntry && chunk.facadeModuleId?.includes( '/src/offscreen/offscreen.js' ) ),
				chunks.find( chunk => chunk.facadeModuleId?.includes( '/src/offscreen/site.js' ) ),
			];
			if ( ! roots[ 0 ] ) return;
			const visit = ( fileName ) => {

				if ( files.has( fileName ) ) return;
				files.add( fileName );
				bundle[ fileName ]?.imports?.forEach( visit );

			};
			for ( const chunk of roots ) if ( chunk ) visit( chunk.fileName );

		},
	};
	const inject = {
		name: 'worker-prefetch',
		apply: 'build',
		configResolved( config ) {

			base = config.base;

		},
		buildStart() {

			files.clear();

		},
		transformIndexHtml: {
			order: 'post',
			handler: () => [ {
				tag: 'template',
				attrs: { id: 'worker-prefetch' },
				children: [ ...files ].map( file => ( {
					tag: 'link',
					attrs: { rel: 'prefetch', href: `${ base }${ file }` },
				} ) ),
				injectTo: 'body',
			} ],
		},
	};
	return { collect, inject };

};

const prefetch = workerPrefetch();

export default defineConfig( ( { mode } ) => ( {
	plugins: [
		saveParamsPlugin(),
		fontPreload(),
		prefetch.inject,
		seoPlugin(),
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
		}, prefetch.collect ],
	},
} ) );
