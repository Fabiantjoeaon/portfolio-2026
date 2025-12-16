const baseFromEnv = ( typeof import.meta !== 'undefined' && import.meta?.env?.BASE_URL ) ? import.meta.env.BASE_URL : '/';
const normalizedBase = baseFromEnv.endsWith( '/' ) ? baseFromEnv.slice( 0, - 1 ) : baseFromEnv;

/**
 * Resolves a public asset path that respects Vite's base configuration.
 * Ensures requests work whether the starter is mounted at / or /starter/.
 *
 * @param {string} target - Asset path relative to the starter root (e.g. "hdr/foo.hdr").
 * @returns {string} Absolute path that includes the correct base.
 */
export function resolvePublicPath( target = '' ) {

	const trimmed = target.replace( /^\//, '' );
	const prefix = normalizedBase || '';
	if ( ! trimmed ) {

		return prefix || '/';

	}

	return `${prefix}/${trimmed}`;

}
