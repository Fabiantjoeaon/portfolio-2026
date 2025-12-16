import { store } from '@/offscreen/store';

class Dispatcher {

	constructor() {

		this.data = {};
		this.listeners = {};
		this.fireAtStart = {};
		this.instances = [];
		this.handlerMap = {}; // New property to track handlers
		this.triggeredEvents = new Set(); // Keep track of all triggered events
		this.globalLastUpdateTime = 0;
		// Cached sorted instances and invalidation flags
		this.sortedInstances = [];
		this.lastInstanceCount = 0;
		this.instancesDirty = true;

	}

	on( e, f ) {

		this.listeners[ e ] = this.listeners[ e ] || [];
		if ( ! this.handlerMap[ e ] ) {

			this.handlerMap[ e ] = new Set();

		}

		if ( ! this.handlerMap[ e ].has( f ) ) {

			this.handlerMap[ e ].add( f );
			this.listeners[ e ].push( f );

		}

	}
	isHandlerRegistered( e, f ) {

		return this.handlerMap[ e ]?.has( f );

	}

	off( e, f ) {

		if ( e in this.listeners === false ) {

			return;

		}

		this.listeners[ e ].splice( this.listeners[ e ].indexOf( f ), 1 );

		if ( this.handlerMap[ e ] ) {

			this.handlerMap[ e ].delete( f );

		}

	}

	register( instance ) {

		this.instances.push( instance );
		// mark cache dirty so sortInstances refreshes even if count stays the same after a swap
		this.instancesDirty = true;

		for ( const k in this.fireAtStart ) {

			this.fireMethod( instance, k );

		}

	}

	unregister( instance ) {

		const index = this.instances.indexOf( instance );

		if ( index > - 1 ) {

			this.instances.splice( index, 1 );

		}

		// mark cache dirty after removal
		this.instancesDirty = true;

	}

	nameToMethod( n ) {

		return `on${n.charAt( 0 ).toUpperCase() + n.slice( 1 )}`;

	}

	fireMethod( instance, name ) {

		const method = instance[ this.nameToMethod( name ) ];

		if ( typeof method === 'function' ) {

			method.call( instance, this.data[ name ] );

		}

	}

	sortInstances() {

		const currentInstanceCount = this.instances.length;
		// Recompute if count changed or cache marked dirty (e.g., HMR swap with same count)
		if ( currentInstanceCount !== this.lastInstanceCount || this.instancesDirty ) {

			this.sortedInstances = Array.from( this.instances ).sort(
				( a, b ) => a.raf.renderPriority - b.raf.renderPriority
			);
			this.lastInstanceCount = currentInstanceCount;
			this.instancesDirty = false;

		}

		return this.sortedInstances || [];

	}

	async triggerOnRaf( { elapsedTime, startTime, delta, now: passedNow } ) {

		const performance = self.performance;
		const now = passedNow ?? performance.now();
		const { gl, scene, camera } = store;

		// Sort the instances by renderPriority
		this.sortInstances();

		for ( const instance of this.sortedInstances ) {

			if ( typeof instance.onBeforeRaf === 'function' ) {

				instance.onBeforeRaf( {
					gl,
					scene,
					camera,
				} );

			}

		}

		let maxDelta = 1; // Maximum delta time is 1 FPS
		const globalDelta =
      delta || Math.min( ( now - this.globalLastUpdateTime ) / 1000, maxDelta );
		this.globalLastUpdateTime = now;

		const pointer = store.pointer;

		for ( const instance of this.sortedInstances ) {

			const hasRaf = typeof instance.onRaf === 'function';
			const hasThrottle = typeof instance.onThrottle === 'function';

			if ( hasRaf || hasThrottle ) {

				if ( hasThrottle ) {

					maxDelta = instance.raf.fps > 0 ? 1 / instance.raf.fps : 1;

				}

				const timeSinceLastUpdate = Math.min(
					now - ( instance.lastUpdateTime || now ),
					maxDelta * 1000
				);
				const fpsInterval = instance.raf.fps > 0 ? 1000 / instance.raf.fps : 1000; // Interval based on instance's FPS

				// Calculate throttleInterpolation for each frame
				let throttleInterpolation = 0;

				if ( fpsInterval > 0 ) {

					throttleInterpolation = ( timeSinceLastUpdate % fpsInterval ) / fpsInterval;

				}

				if ( instance.raf.fps === Infinity ) {

					throttleInterpolation = 0; // If the instance is set to update every frame, the interpolation is not needed

				} else if ( hasThrottle ) {

					if ( Math.floor( timeSinceLastUpdate ) >= Math.floor( fpsInterval ) ) {

						// If the component should update, reset throttleInterpolation to 1
						throttleInterpolation = 1;

						const throttledDelta = timeSinceLastUpdate / 1000; // Convert to seconds
						instance.onThrottle( {
							delta: throttledDelta,
							elapsedTime,
							startTime,
							gl,
							scene,
							camera,
							pointer
						} );

						instance.lastUpdateTime = now;

					}

				}

				if ( hasRaf ) {

					await instance.onRaf( {
						delta: globalDelta,
						throttleInterpolation,
						elapsedTime,
						startTime,
						gl,
						scene,
						camera,
						pointer,
					} );

				}

			}

		}

		for ( const instance of this.sortedInstances ) {

			if ( typeof instance.onAfterRaf === 'function' ) {

				await instance.onAfterRaf( {
					gl,
					scene,
					camera,
				} );

			}

		}

	}

	trigger( { name, fireAtStart = false, log = false }, data = {} ) {

		this.data[ name ] = data;
		if ( name !== 'newEventRegistered' && typeof window === 'undefined' ) {

			this.trigger( { name: 'newEventRegistered' }, { newEvent: name } );

		}

		if ( fireAtStart ) {

			this.fireAtStart[ name ] = true;

		}

		if ( log ) {

			console.log( `👨‍🏫 ${name} – ${data}` );

		}

		if ( name in this.listeners ) {

			for ( let i = 0; i < this.listeners[ name ].length; i ++ ) {

				this.listeners[ name ][ i ].call( this, data );

			}

		}

		this.instances.forEach( ( instance ) => this.fireMethod( instance, name ) );

	}

}

const dispatcherSingleton = /* @__PURE__ */ new Dispatcher();

export default dispatcherSingleton;
