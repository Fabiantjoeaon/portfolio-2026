import { store } from '@/offscreen/store';

const DOM_EVENTS = {
	onClick: [ 'click', false ],
	onContextMenu: [ 'contextmenu', false ],
	onDoubleClick: [ 'dblclick', false ],
	onWheel: [ 'wheel', true ],
	onPointerDown: [ 'pointerdown', true ],
	onPointerUp: [ 'pointerup', true ],
	onPointerLeave: [ 'pointerleave', true ],
	onPointerMove: [ 'pointermove', true ],
	onPointerCancel: [ 'pointercancel', true ],
	onLostPointerCapture: [ 'lostpointercapture', true ],
};

function initDomEvents( api, canvas ) {

	// Attach DOM events to canvas
	Object.values( DOM_EVENTS ).forEach( ( [ eventName, passive ] ) => {

		// DOM copy overlays the About canvas; keep portrait lighting responsive.
		const target = eventName === 'pointermove' ? window : canvas;
		target.addEventListener(
			eventName,
			( event ) => {

				if ( ! passive ) {

					event.preventDefault();

				}

				const payload = {
					eventName,
					type: eventName,
					shiftKey: event.shiftKey,
					clientX: event.clientX,
					clientY: event.clientY,
					offsetX: event.offsetX,
					offsetY: event.offsetY,
					x: event.x,
					y: event.y,
					touches: event.touches,
					changedTouches: event.changedTouches,
					pointerType: event.pointerType,
					button: event.button,
					pointerId: event.pointerId,
					deltaY: event.deltaY,
					deltaX: event.deltaX,
					pageX: event.pageX,
					pageY: event.pageY,
					pressure: event.pressure,
					width: event.width,
					height: event.height,
					tiltX: event.tiltX,
					tiltY: event.tiltY,
					isPrimary: event.isPrimary,
					pointer: event.pointer,
					pointerType: event.pointerType,
					pointerId: event.pointerId,
				};
				// Object.assign(payload, event)
				api.trigger(
					{ name: eventName, fireAtStart: true, fireVirtualEvents: true },
					payload
				);

			},
			{ passive }
		);

	} );

	// Resize canvas to match window
	const handleResize = () => {

		const settings = {
			width: window.innerWidth,
			height: window.innerHeight,
			dpr: Math.min( store.dpr, window.devicePixelRatio ),
			ratio: window.innerWidth / window.innerHeight,
		};

		store.canvasSize = settings;
		api.trigger( { name: 'resize', fireAtStart: true }, settings );

	};

	window.addEventListener( 'resize', handleResize );
	handleResize();

}

export { initDomEvents };
