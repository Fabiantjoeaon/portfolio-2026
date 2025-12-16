import * as THREE from 'three/webgpu';
import { component, updateComponentRegistry } from '@/offscreen/dispatcher';
import { scene } from '@/offscreen/main';

export class Component extends component( THREE.Mesh, {
	raf: {
		renderPriority: 1,
		fps: Number.Infinity, // throttle update locally
	},
} ) {

	init() {

		// ---------- Geometry & Material ----------
		this.geometry = new THREE.BoxGeometry( 2, 2, 2 );
		this.material = new THREE.MeshPhysicalNodeMaterial();
		this.material.name = 'ComponentMaterial';

		scene.add( this );

	}

	onDebug( { /* gui */ } ) {}

	onRaf( { /* elapsedTime, delta */ } ) {}
	onResize() {}

	dispose() {

		// trigger disposeAll from component dispose
		super.dispose();

	}

}

// Minimal HMR setup
if ( import.meta.hot ) {

	import.meta.hot.accept( ( newModule ) => {

		updateComponentRegistry( 'Component', newModule );

	} );

}
