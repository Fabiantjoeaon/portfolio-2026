import dispatcher from '@/shared/dispatcher';
import { store } from '@/offscreen/store';
import gsap from 'gsap';

class Raf {

	constructor() {

		this.time = self.performance.now();

		/**
		 * A reference to the context from `requestAnimationFrame()` can
		 * be called (usually `window`).
		 *
		 * @type {?(Window|XRSession)}
		 */
		this._context = typeof self !== 'undefined' ? self : null;

	}

	start( gl ) {

		this.startTime = self.performance.now();
		this.oldTime = this.startTime;
		this.isPaused = false;

		gl.setAnimationLoop( async ( now, xrFrame ) => {

			const { recording } = store;

			// Recording branch: drive deterministic time and capture frames without spawning a second RAF
			if ( recording ) {

				if ( this._isRecordingProcessing ) return;
				this._isRecordingProcessing = true;

				try {

					const frameRate = store.recordFrameRate || 60;
					// Deterministic timebase for GSAP and the scene
					this._recordTime = ( this._recordTime ?? 0 ) + 1 / frameRate;

					try {

						gsap.updateRoot( this._recordTime );

					} catch ( e ) {

						// noop
						console.warn( e );

					}

					// Render the frame with deterministic delta
					await dispatcher.triggerOnRaf( {
						now: this._recordTime * 1000,
						delta: 1 / frameRate,
						xrFrame,
					} );

					if ( store.recorder && typeof store.recorder.step === 'function' ) {

						await store.recorder.step();

					}

					store.recordFrameCount = ( store.recordFrameCount || 0 ) + 1;

					if ( store.recordTotalFrames && store.recordFrameCount >= store.recordTotalFrames ) {

						let buffer;
						if ( store.recorder && typeof store.recorder.stop === 'function' ) {

							buffer = await store.recorder.stop();

						}

						store.recording = false;
						this._recordTime = 0;
						// Notify main thread/UI with the recorded buffer for download handling
						dispatcher.trigger( { name: 'recordingStopped' }, { buffer } );

					}

				} finally {

					this._isRecordingProcessing = false;

				}

				// Do not run the non-recording branch when recording
				return;

			}

			if ( ! this.isPaused ) {

				dispatcher.triggerOnRaf( {
					now,
					xrFrame,
				} );

			}

		} );

	}

	pause() {

		this.isPaused = true;

	}

}

export const raf = new Raf();
