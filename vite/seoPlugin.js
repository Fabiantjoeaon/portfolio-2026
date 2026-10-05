import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ROUTES, SITE, routeMeta } from '../src/shared/seo.js';

const BLOCK = /<!--seo-->[\s\S]*?<!--\/seo-->/;

const escape = ( value ) => String( value )
	.replace( /&/g, '&amp;' ).replace( /"/g, '&quot;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' );

const absolute = ( path ) => new URL( path, SITE.url ).href;

// Share images must be fetchable from wherever this build is served; the
// canonical domain only works once it points at this deploy. Netlify sets
// URL (primary address) for production and DEPLOY_PRIME_URL for previews.
let assetOrigin = SITE.url;
const asset = ( path ) => new URL( path, assetOrigin ).href;
const deployOrigin = () => ( process.env.CONTEXT === 'production' ? process.env.URL : process.env.DEPLOY_PRIME_URL ) || SITE.url;

const structuredData = ( meta ) => {

	const url = absolute( meta.path );
	const person = {
		'@type': 'Person',
		'@id': `${ SITE.url }/#person`,
		name: SITE.name,
		jobTitle: SITE.role,
		email: `mailto:${ SITE.email }`,
		url: absolute( '/about' ),
		image: asset( '/icon-512.png' ),
		knowsAbout: [ 'Creative development', 'Technical direction', 'WebGPU', 'WebGL', 'Three.js', 'Real-time 3D', 'Shaders', 'Audio' ],
	};
	const website = {
		'@type': 'WebSite',
		'@id': `${ SITE.url }/#website`,
		url: absolute( '/' ),
		name: SITE.name,
		description: SITE.description,
		inLanguage: 'en',
		publisher: { '@id': person[ '@id' ] },
	};
	const page = {
		'@type': meta.type === 'profile' ? 'ProfilePage' : 'WebPage',
		'@id': `${ url }#webpage`,
		url,
		name: meta.title,
		description: meta.description,
		isPartOf: { '@id': website[ '@id' ] },
		primaryImageOfPage: asset( meta.image ),
		...( meta.type === 'profile' ? { mainEntity: { '@id': person[ '@id' ] } } : { about: { '@id': person[ '@id' ] } } ),
	};
	const graph = [ website, person, page ];
	if ( meta.project ) {

		const { project } = meta;
		graph.push( {
			'@type': 'CreativeWork',
			'@id': `${ url }#work`,
			name: project.name,
			description: project.description,
			url,
			image: asset( meta.image ),
			dateCreated: project.year,
			creator: { '@id': person[ '@id' ] },
			sourceOrganization: { '@type': 'Organization', name: project.client },
			...( project.url ? { sameAs: project.url } : {} ),
		} );
		page.mainEntity = { '@id': `${ url }#work` };

	}

	return JSON.stringify( { '@context': 'https://schema.org', '@graph': graph } ).replace( /</g, '\\u003c' );

};

export const seoHead = ( meta ) => {

	const url = absolute( meta.path );
	const image = asset( meta.image );
	const alt = meta.project ? `${ meta.project.name } by ${ SITE.name }` : SITE.title;
	return `<!--seo-->
    <title>${ escape( meta.title ) }</title>
    <meta name="description" content="${ escape( meta.description ) }" />
    <link rel="canonical" href="${ url }" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <meta name="author" content="${ escape( SITE.name ) }" />
    <meta name="theme-color" content="${ SITE.themeColor }" />
    <meta name="color-scheme" content="dark" />
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <meta property="og:type" content="${ meta.type === 'article' ? 'article' : meta.type === 'profile' ? 'profile' : 'website' }" />
    <meta property="og:site_name" content="${ escape( SITE.name ) }" />
    <meta property="og:locale" content="${ SITE.locale }" />
    <meta property="og:url" content="${ url }" />
    <meta property="og:title" content="${ escape( meta.title ) }" />
    <meta property="og:description" content="${ escape( meta.shareDescription ) }" />
    <meta property="og:image" content="${ image }" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="${ SITE.image.width }" />
    <meta property="og:image:height" content="${ SITE.image.height }" />
    <meta property="og:image:alt" content="${ escape( alt ) }" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${ escape( meta.title ) }" />
    <meta name="twitter:description" content="${ escape( meta.shareDescription ) }" />
    <meta name="twitter:image" content="${ image }" />
    <meta name="twitter:image:alt" content="${ escape( alt ) }" />
    <script type="application/ld+json">${ structuredData( meta ) }</script>
    <!--/seo-->`;

};

const sitemap = () => {

	const lastmod = new Date().toISOString().slice( 0, 10 );
	const urls = ROUTES.map( ( path ) => {

		const meta = routeMeta( path );
		return `  <url>
    <loc>${ absolute( path ) }</loc>
    <lastmod>${ lastmod }</lastmod>
    <priority>${ path === '/' ? '1.0' : path === '/about' ? '0.8' : '0.7' }</priority>
    <image:image><image:loc>${ asset( meta.image ) }</image:loc></image:image>
  </url>`;

	} );
	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${ urls.join( '\n' ) }
</urlset>
`;

};

/**
 * Head tags per route. Builds write a prerendered index.html for every route
 * so crawlers and link previews get route meta without running the app.
 */
export const seoPlugin = () => {

	let outDir, build;
	return {
		name: 'seo',
		configResolved( config ) {

			outDir = resolve( config.root, config.build.outDir );
			build = config.command === 'build' && ! config.build.watch;
			if ( config.command === 'build' ) assetOrigin = deployOrigin();

		},
		transformIndexHtml( html, context ) {

			const local = context.server?.resolvedUrls?.local[ 0 ];
			if ( local ) assetOrigin = local;
			const path = context.originalUrl?.split( /[?#]/ )[ 0 ] ?? '/';
			return html.replace( '<!--seo-->', seoHead( routeMeta( path ) ) );

		},
		closeBundle() {

			if ( ! build ) return;
			const html = readFileSync( join( outDir, 'index.html' ), 'utf8' );
			for ( const path of ROUTES.slice( 1 ) ) {

				const file = join( outDir, path, 'index.html' );
				mkdirSync( dirname( file ), { recursive: true } );
				writeFileSync( file, html.replace( BLOCK, seoHead( routeMeta( path ) ) ) );

			}
			writeFileSync( join( outDir, 'sitemap.xml' ), sitemap() );
			writeFileSync( join( outDir, 'robots.txt' ), `User-agent: *\nAllow: /\n\nSitemap: ${ absolute( '/sitemap.xml' ) }\n` );

		},
	};

};
