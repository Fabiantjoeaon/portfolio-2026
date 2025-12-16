import {
	createApp,
	ref,
	onMounted,
} from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

// import the 3D project, init starts the loader and 3D dispatcher is the event bus
import { init, dispatcher } from '/src/main.js';

createApp( {
	setup() {

		const value = ref( 0 );

		onMounted( () => {

			init( {
				debug: window.location.href.includes( 'debug' ),
				record: false,
				offscreen: ! window.location.href.includes( 'debug' ),
			} );
			dispatcher.on( 'loadProgress', ( { progress } ) => {

				console.log( `⏳ Loading ${progress.toFixed( 2 )}%` );
				value.value = progress.toFixed( 2 );

			} );

		} );

		return {
			value,
		};

	},
} ).mount( '#app' );
