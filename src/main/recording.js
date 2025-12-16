import dispatcher from '@/shared/dispatcher';
import { store } from '@/offscreen/store';
import gsap from 'gsap';

export async function setupRecording( { context, api, options = {} } ) {

	const DEFAULTS = {
		width: 1920,
		height: 1080,
		frameRate: 60,
		duration: 10,
		extension: 'mp4',
		encoder: '', // e.g. 'H264MP4Encoder'
	};

	const CONFIG = { ...DEFAULTS, ...options };

	// Ensure GSAP is deterministic during recording
	gsap.ticker.lagSmoothing( 0 );
	gsap.ticker.remove( gsap.updateRoot );

	// Overlay UI
	const prevSize = {
		width: window.innerWidth,
		height: window.innerHeight,
		dpr: Math.min( window.devicePixelRatio || 1, 2 ),
	};

	const overlay = document.createElement( 'div' );
	overlay.id = 'record-overlay';
	overlay.innerHTML = `
    <button id="rec-btn" aria-pressed="false">
      <span class="dot"></span>
      <span class="label">Record</span>
    </button>
    <button id="shot-btn" aria-label="Screenshot">
      <span class="label">Shot</span>
    </button>
    <div id="rec-progress" aria-hidden="true">
      <div class="bar"><div class="fill"></div></div>
      <div class="time">00:00 / 00:00</div>
    </div>
    <a id="save-btn" download aria-hidden="true">Save</a>
  `;
	const style = document.createElement( 'style' );
	style.textContent = `
    #record-overlay{position:fixed;bottom:16px;left:16px;z-index:10000;display:flex;gap:12px;align-items:center;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
    #rec-btn{all:unset;background:rgba(20,20,20,.7);color:#fff;border:1px solid rgba(255,255,255,.2);padding:8px 12px;border-radius:999px;display:flex;align-items:center;gap:8px;cursor:pointer;backdrop-filter:saturate(120%) blur(6px)}
    #rec-btn:hover{background:rgba(30,30,30,.85)}
    #rec-btn[aria-pressed="true"]{background:#d7263d}
    #rec-btn .dot{width:10px;height:10px;border-radius:50%;background:#ff3b30;box-shadow:0 0 0 0 rgba(255,59,48,.6);animation:pulse 2s infinite}
    #rec-btn[aria-pressed="true"] .dot{background:#111;box-shadow:none}
    #rec-btn .label{font-weight:600;letter-spacing:.2px}
    #shot-btn{all:unset;background:rgba(20,20,20,.7);color:#fff;border:1px solid rgba(255,255,255,.2);padding:8px 12px;border-radius:999px;display:flex;align-items:center;gap:8px;cursor:pointer;backdrop-filter:saturate(120%) blur(6px)}
    #shot-btn:hover{background:rgba(30,30,30,.85)}
    #rec-progress{min-width:200px;}
    #rec-progress .bar{width:100%;height:8px;background:rgba(255,255,255,.15);border-radius:999px;overflow:hidden}
    #rec-progress .fill{height:100%;width:0%;background:linear-gradient(90deg,#ff3b30,#ff9f0a);transition:width .1s linear}
    #rec-progress .time{margin-top:6px;color:#fff;font-size:12px;text-align:right;opacity:.85}
    #save-btn{all:unset;background:rgba(20,20,20,.7);color:#fff;border:1px solid rgba(255,255,255,.2);padding:8px 12px;border-radius:999px;display:none;align-items:center;gap:8px;cursor:pointer;backdrop-filter:saturate(120%) blur(6px);text-decoration:none}
    #save-btn:hover{background:rgba(30,30,30,.85)}
    #save-btn.show{display:inline-flex}
    @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(255,59,48,.6)}70%{box-shadow:0 0 0 10px rgba(255,59,48,0)}100%{box-shadow:0 0 0 0 rgba(255,59,48,0)}}
  `;
	document.head.appendChild( style );
	document.body.appendChild( overlay );

	const recBtn = overlay.querySelector( '#rec-btn' );
	const fillEl = overlay.querySelector( '#rec-progress .fill' );
	const timeEl = overlay.querySelector( '#rec-progress .time' );
	const labelEl = overlay.querySelector( '#rec-btn .label' );
	const saveBtn = overlay.querySelector( '#save-btn' );
	const shotBtn = overlay.querySelector( '#shot-btn' );
	let pendingDownloadURL = null;
	let isStopping = false; // prevent double-stops and reflect UI state while encoding finalizes

	// Disabled until recorder is ready
	recBtn.style.opacity = '0.6';
	recBtn.style.pointerEvents = 'none';

	const fmt = ( t ) => {

		const m = Math.floor( t / 60 )
			.toString()
			.padStart( 2, '0' );
		const s = Math.floor( t % 60 )
			.toString()
			.padStart( 2, '0' );
		return `${m}:${s}`;

	};

	const revokePendingURL = () => {

		if ( pendingDownloadURL ) {

			URL.revokeObjectURL( pendingDownloadURL );
			pendingDownloadURL = null;

		}

	};

	const setupSaveLink = ( filename, buffer, mimeType ) => {

		try {

			revokePendingURL();
			const blob = new Blob( Array.isArray( buffer ) ? buffer : [ buffer ], {
				type: mimeType || 'application/octet-stream',
			} );
			pendingDownloadURL = URL.createObjectURL( blob );
			if ( saveBtn ) {

				saveBtn.href = pendingDownloadURL;
				saveBtn.download = filename || 'recording.mp4';
				saveBtn.classList.add( 'show' );
				saveBtn.setAttribute( 'aria-hidden', 'false' );

			}

			return true;

		} catch ( e ) {

			console.warn( 'Failed to prepare save link', e );
			return false;

		}

	};

	const forceDownload = ( filename, buffer, mimeType ) => {

		try {

			const blob = new Blob( Array.isArray( buffer ) ? buffer : [ buffer ], {
				type: mimeType || 'application/octet-stream',
			} );
			const url = URL.createObjectURL( blob );
			const a = document.createElement( 'a' );
			a.href = url;
			a.download = filename || 'recording.mp4';
			document.body.appendChild( a );
			a.click();
			setTimeout( () => {

				URL.revokeObjectURL( url );
				document.body.removeChild( a );

			}, 0 );
			return true;

		} catch ( e ) {

			console.warn( 'Auto download failed', e );
			return false;

		}

	};

	if ( saveBtn ) {

		saveBtn.addEventListener( 'click', () => {

			// Revoke shortly after click to let the browser start the download
			setTimeout( () => revokePendingURL(), 10000 );
			saveBtn.classList.remove( 'show' );
			saveBtn.setAttribute( 'aria-hidden', 'true' );

		} );

	}

	// Screenshot current canvas content as PNG
	if ( shotBtn ) {

		shotBtn.addEventListener( 'click', () => {

			const canvasEl = context?.canvas || document.querySelector( 'canvas' );
			if ( ! canvasEl ) return;
			const ts = new Date().toISOString().replace( /[:.]/g, '-' );
			const filename = `screenshot-${ts}.png`;
			try {

				if ( canvasEl.toBlob ) {

					canvasEl.toBlob(
						( blob ) => {

							if ( ! blob ) return;
							const ok = forceDownload( filename, blob, 'image/png' );
							if ( ! ok ) {

								setupSaveLink( filename, blob, 'image/png' );

							}

						},
						'image/png'
					);

				} else {

					const dataUrl = canvasEl.toDataURL( 'image/png' );
					const a = document.createElement( 'a' );
					a.href = dataUrl;
					a.download = filename;
					document.body.appendChild( a );
					a.click();
					document.body.removeChild( a );

				}

			} catch ( e ) {

				console.warn( 'Screenshot failed', e );

			}

		} );

	}

	const updateOverlay = () => {

		const totalFrames = store.recordTotalFrames || 0;
		const frameRate = store.recordFrameRate || 60;
		const count = store.recordFrameCount || 0;
		const totalT = totalFrames / frameRate || 0;
		const curT = count / frameRate || 0;
		const pct = totalFrames > 0 ? Math.min( 100, ( count / totalFrames ) * 100 ) : 0;
		if ( fillEl ) fillEl.style.width = `${pct}%`;
		if ( timeEl ) timeEl.textContent = `${fmt( curT )} / ${fmt( totalT )}`;
		if ( recBtn ) {

			recBtn.setAttribute( 'aria-pressed', store.recording ? 'true' : 'false' );
			labelEl.textContent = store.recording ? 'Stop' : isStopping ? 'Stop…' : 'Record';

		}

		requestAnimationFrame( updateOverlay );

	};

	updateOverlay();

	let canvasRecorder;

	dispatcher.on( 'loadEnd', async () => {

		const { Recorder, RecorderStatus, Encoders } = await import( 'canvas-record' );

		canvasRecorder = new Recorder( context, {
			name: `canvas-record-example-${CONFIG.encoder || 'default'}`,
			extension: CONFIG.extension,
			duration: CONFIG.duration,
			frameRate: CONFIG.frameRate,
			download: false,
			target: 'in-browser',
			filename: '',
			encoder: CONFIG.encoder ? new Encoders[ `${CONFIG.encoder}` ]() : null,
			encoderOptions: {},
		} );

		store.recorder = canvasRecorder;
		store.recordFrameRate = CONFIG.frameRate;
		store.recordTotalFrames = Math.round( CONFIG.duration * CONFIG.frameRate );
		store.recordFrameCount = 0;

		// Enable the record button now that the recorder is ready
		recBtn.style.opacity = '1';
		recBtn.style.pointerEvents = 'auto';

		const startRecording = async () => {

			if ( canvasRecorder.status === RecorderStatus.Recording ) return;
			if ( isStopping ) return;

			// Resize to recording resolution first
			api.trigger(
				{ name: 'resize', fireAtStart: true },
				{
					width: CONFIG.width,
					height: CONFIG.height,
					dpr: 1,
					ratio: CONFIG.width / CONFIG.height,
				}
			);

			// Start the recorder first, then switch RAF into deterministic record mode
			// await canvasRecorder.start();
			await canvasRecorder.start( { initOnly: true } );

			store.recordFrameCount = 0;
			store.recording = true;
			isStopping = false;

		};

		const stopRecording = () => {

			if ( isStopping ) return; // guard double stop
			if ( canvasRecorder.status !== RecorderStatus.Recording ) return;

			// Flip state immediately so RAF branch halts next frame and UI reflects stop
			store.recording = false;
			isStopping = true;
			recBtn.style.opacity = '0.6';
			recBtn.style.pointerEvents = 'none';

			// Restore previous canvas size immediately for responsiveness
			api.trigger(
				{ name: 'resize', fireAtStart: true },
				{
					width: prevSize.width,
					height: prevSize.height,
					dpr: prevSize.dpr,
					ratio: prevSize.width / prevSize.height,
				}
			);

			// Finalize encoder asynchronously; when ready, prepare save link and try auto-download
			Promise.resolve()
				.then( () => canvasRecorder.stop() )
				.then( ( buffer ) => {

					const filename = canvasRecorder.filename || 'recording.mp4';
					const mimeType = canvasRecorder.encoder?.mimeType || 'video/mp4';
					// Always prepare a visible save link first for reliability/fallback
					setupSaveLink( filename, buffer, mimeType );
					// Then try to auto-download (may be blocked depending on browser/user-activation)
					forceDownload( filename, buffer, mimeType );

				} )
				.catch( ( e ) => {

					console.warn( 'Recorder stop failed', e );

				} )
				.finally( () => {

					isStopping = false;
					recBtn.style.opacity = '1';
					recBtn.style.pointerEvents = 'auto';

				} );

		};

		recBtn.addEventListener( 'click', async () => {

			if ( isStopping ) return;
			if ( canvasRecorder.status === RecorderStatus.Recording ) {

				// Do not await stop; make it non-blocking so UI remains responsive
				stopRecording();

			} else {

				await startRecording();

			}

		} );

		// Auto-stop handler (e.g., when totalFrames reached in RAF)
		dispatcher.on( 'recordingStopped', ( { buffer } ) => {

			// Restore previous canvas size
			api.trigger(
				{ name: 'resize', fireAtStart: true },
				{
					width: prevSize.width,
					height: prevSize.height,
					dpr: prevSize.dpr,
					ratio: prevSize.width / prevSize.height,
				}
			);
			// Prepare a save link and then attempt auto-download
			if ( buffer ) {

				const filename = canvasRecorder?.filename || 'recording.mp4';
				const mimeType = canvasRecorder?.encoder?.mimeType || 'video/mp4';
				setupSaveLink( filename, buffer, mimeType );
				forceDownload( filename, buffer, mimeType );

			}

		} );

	} );

}
