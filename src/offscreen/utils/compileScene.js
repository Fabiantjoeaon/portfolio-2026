import * as THREE from 'three/webgpu';

// Orthographic camera sees everything in its box - no perspective culling
const compileCamera = new THREE.OrthographicCamera(
	- 1e10, 1e10, // left, right
	1e10, - 1e10, // top, bottom
	- 1e10, 1e10 // near (negative = behind), far
);

// Negative near plane means it sees objects "behind" it too
compileCamera.updateMatrixWorld();
compileCamera.updateProjectionMatrix();

export async function compileScene( gl, scene, camera = compileCamera ) {

	const original = new WeakMap();
	const originalPerObject = new WeakMap()
	const invisibleOriginal = new WeakMap();

	scene.traverse( ( obj ) => {

		if ( obj.frustumCulled ) {

			original.set( obj, true );
			obj.frustumCulled = false;

		}

		if ( obj.perObjectFrustumCulled ) {

			originalPerObject.set( obj, true );
			obj.perObjectFrustumCulled = false;

		}

		if ( obj.visible === false ) {

			invisibleOriginal.set( obj, true );
			obj.visible = true;

		}

	} );

	await gl.compileAsync( scene, camera );

	scene.traverse( ( obj ) => {

		if ( original.has( obj ) ) obj.frustumCulled = true;
		if ( invisibleOriginal.has( obj ) ) obj.visible = false;
		if ( originalPerObject.has( obj ) ) obj.perObjectFrustumCulled = true;

	} );

}
