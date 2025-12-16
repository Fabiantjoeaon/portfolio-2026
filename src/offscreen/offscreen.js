import Renderer from '@/offscreen/renderer';

import * as Comlink from 'comlink';
import virtualElement from '@/offscreen/dispatcher/helpers/virtualElement';
import dispatcher from '@/shared/dispatcher.js';
import { store } from '@/offscreen/store.js';
import Site from '@/offscreen/site.js';
async function initOffscreen( canvas, isWebGPU ) {

	let success = false;
	try {

		const gl = new Renderer( { canvas, isWebGPU } );
		await gl.init();

		new Site( {
			gl,
		} );
		success = true;

	} catch ( error ) {

		console.error( error );

	}

	return success;

}

function trigger( event, data ) {

	// event.log = true;
	dispatcher.trigger( event, data );

	if ( event.name === 'resize' ) {

		virtualElement.setSize( data.width, data.height );

	}

	if ( event.name === 'scroll' ) {

		store.scroll = data.progress;

	}

	if ( event.fireVirtualEvents ) {

		virtualElement.dispatchEvent( {
			...data,
			target: virtualElement,
		} );

	}

}

function subscribeToAllEvents( cb ) {

	const registeredHandlers = {}; // Store references to handlers

	const eventHandler = ( eventName ) => {

		if ( ! registeredHandlers[ eventName ] ) {

			registeredHandlers[ eventName ] = ( eventData ) => {

				// If eventData is a Proxy then ignore because it comes from the mainthread
				if ( eventData && eventData[ Comlink.proxyMarker ] ) {

					return;

				}

				if ( eventName ) {

					cb( {
						name: eventName,
						data: Comlink.proxy( eventData ),
					} );

				}

			};

		}

		return registeredHandlers[ eventName ];

	};

	const handleNewEvent = ( data ) => {

		const { newEvent } = data;
		if ( newEvent !== 'newEventRegistered' ) {

			const handler = eventHandler( newEvent );
			if ( ! dispatcher.isHandlerRegistered( newEvent, handler ) ) {

				dispatcher.on( newEvent, handler );

			}

		}

	};

	// Subscribe to the special event for new event registrations
	dispatcher.on( 'newEventRegistered', handleNewEvent );

	// Subscribe to all existing events
	for ( const eventName in dispatcher.listeners ) {

		const handler = eventHandler( eventName );
		if ( ! dispatcher.isHandlerRegistered( eventName, handler ) ) {

			dispatcher.on( eventName, handler );

		}

	}

}

// Usage

const workerApi = {
	initOffscreen,
	trigger,
	subscribeToAllEvents,
};

Comlink.expose( workerApi );
