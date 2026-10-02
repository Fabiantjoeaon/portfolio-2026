// Captures 1200×630 share images for every route from a running dev server
// (`npm run dev`) into public/og/. Usage: npm run seo:images [-- --only about]
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROUTES } from '../src/shared/seo.js';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.ORIGIN ?? 'http://[::1]:4000';
const OUT = new URL( '../public/og/', import.meta.url ).pathname;
const WIDTH = 1200, HEIGHT = 630, SCALE = 1, PORT = 9351;
const only = process.argv.includes( '--only' ) ? process.argv[ process.argv.indexOf( '--only' ) + 1 ] : null;

const nameOf = path => path === '/' ? 'home' : path.split( '/' ).pop();
const sleep = ms => new Promise( resolve => setTimeout( resolve, ms ) );

mkdirSync( OUT, { recursive: true } );
const profile = join( tmpdir(), `og-capture-${ Date.now() }` );
const chrome = spawn( CHROME, [
	'--headless=new', `--remote-debugging-port=${ PORT }`, '--enable-unsafe-webgpu', '--use-angle=metal',
	'--hide-scrollbars', '--mute-audio', `--window-size=${ WIDTH },${ HEIGHT }`, `--user-data-dir=${ profile }`, 'about:blank',
], { stdio: 'ignore' } );

let target;
for ( let i = 0; i < 50 && ! target; i ++ ) {

	await sleep( 200 );
	try {

		target = ( await ( await fetch( `http://127.0.0.1:${ PORT }/json` ) ).json() ).find( entry => entry.type === 'page' );

	} catch {}

}
const socket = new WebSocket( target.webSocketDebuggerUrl );
await new Promise( resolve => socket.addEventListener( 'open', resolve ) );
let id = 0;
const pending = new Map();
socket.addEventListener( 'message', event => {

	const message = JSON.parse( event.data );
	if ( message.id ) pending.get( message.id )?.( message.result );

} );
const send = ( method, params = {} ) => new Promise( resolve => {

	const next = ++ id;
	pending.set( next, resolve );
	socket.send( JSON.stringify( { id: next, method, params } ) );

} );
const evaluate = async expression => ( await send( 'Runtime.evaluate', { expression, returnByValue: true } ) )?.result?.value;

await send( 'Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: SCALE, mobile: false } );
for ( const path of ROUTES ) {

	const name = nameOf( path );
	if ( only && only !== name ) continue;
	await send( 'Page.navigate', { url: `${ ORIGIN }${ path }?skipLoader&manual` } );
	await sleep( 1000 );
	for ( let i = 0; i < 600; i ++ ) {

		await sleep( 200 );
		if ( await evaluate( `document.readyState === 'complete' && !document.querySelector('#loader-overlay')` ) ) break;

	}
	// The startup wipe and page reveals settle.
	await sleep( path === '/' ? 6000 : 8000 );
	// An idle headless page stops producing frames; the capture waits for one.
	await send( 'Runtime.evaluate', { expression: 'new Promise(resolve => requestAnimationFrame(resolve))', awaitPromise: true } );
	const { data } = await send( 'Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 } } );
	const png = join( tmpdir(), `og-${ name }.png` );
	writeFileSync( png, Buffer.from( data, 'base64' ) );
	execFileSync( 'magick', [ png, '-resize', `${ WIDTH }x${ HEIGHT }!`, '-strip', '-interlace', 'Plane', '-quality', '86', join( OUT, `${ name }.jpg` ) ] );
	rmSync( png );
	console.log( `og/${ name }.jpg` );

}

const exited = new Promise( resolve => chrome.once( 'exit', resolve ) );
chrome.kill();
await exited;
rmSync( profile, { recursive: true, force: true } );
process.exit( 0 );
