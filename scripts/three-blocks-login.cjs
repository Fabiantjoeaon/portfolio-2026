#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');

const RAW_BLOCKED_KEYS = [
  "npm_config__three_blocks_registry",
  "npm_config_verify_deps_before_run",
  "npm_config_global_bin_dir",
  "npm_config__jsr_registry",
  "npm_config_node_linker"
];
const BLOCKED_KEYS = new Set(
	RAW_BLOCKED_KEYS.map( ( key ) => key.replace( /-/g, '_' ).toLowerCase() )
);

const normalize = ( key ) => key.replace( /-/g, '_' ).toLowerCase();

const scrubEnv = ( source ) => {

	const next = { ...source };
	for ( const key of Object.keys( next ) ) {

		if ( BLOCKED_KEYS.has( normalize( key ) ) ) {

			delete next[ key ];

		}

	}

	return next;

};

const shouldSkip = /^1|true|yes$/i.test( String( process.env.THREE_BLOCKS_LOGIN_SKIP || '' ) );
if ( shouldSkip ) {

	process.exit( 0 );

}

const env = scrubEnv( process.env );
const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = [ '-y', 'three-blocks-login@latest', ...process.argv.slice( 2 ) ];
const result = spawnSync( cmd, args, { stdio: 'inherit', env } );

if ( result.error ) {

	console.error( result.error.message || result.error );
	process.exit( 1 );

}

process.exit( result.status ?? 0 );
