import * as THREE from 'three/webgpu';
import { camera } from '@/offscreen/main';
import dispatcher from '@/shared/dispatcher';
import { component } from './component';
import virtualElement from './virtualElement';
import { store } from '@/offscreen/store';

const mouseVec3 = new THREE.Vector3();
const velocityVec3 = new THREE.Vector3();
class Pointer extends component() {

	constructor() {

		super();
		this.x = 0;
		this.y = 0;
		this.isTouching = true;
		this.distance = 0;

		this.hold = new THREE.Vector2();
		this.last = new THREE.Vector2();
		this.delta = new THREE.Vector2();
		this.move = new THREE.Vector2();
		this.world = new THREE.Vector3();
		this.normalized = new THREE.Vector2();
		this._tmp = new THREE.Vector3();

	}

	onStart( events ) {

		const e = this.convertEvent( events );

		this.isTouching = true;
		this.x = e.x;
		this.y = e.y;

		this.hold.set( e.x, e.y );
		this.last.set( e.x, e.y );
		this.delta.set( 0, 0 );
		this.move.set( 0, 0 );

		this.normalized.x = ( this.x / virtualElement.width ) * 2 - 1;
		this.normalized.y = - ( this.y / virtualElement.height ) * 2 + 1;
		this.distance = 0;

		dispatcher.trigger(
			{
				name: 'pointerStart',
			},
			{
				pointer: this,
			}
		);

	}

	convertEvent( e ) {

		const t = {
			x: 0,
			y: 0,
		};

		if ( ! e ) {

			return t;

		}

		if ( e.windowsPointer ) {

			return e;

		}

		if ( e.touches || e.changedTouches ) {

			if ( e.touches.length ) {

				t.x = e.touches[ 0 ].pageX;
				t.y = e.touches[ 0 ].pageY;

			} else {

				t.x = e.changedTouches[ 0 ].pageX;
				t.y = e.changedTouches[ 0 ].pageY;

			}

		} else {

			t.x = e.clientX;
			t.y = e.clientY;

		}

		// t.x = clamp(t.x, 0, viewport.width);
		// t.y = clamp(t.y, 0, viewport.height);

		return t;

	}

	onPointermove( events ) {

		const e = this.convertEvent( events );
		if ( this.isTouching ) {

			this.move.x = e.x - this.hold.x;
			this.move.y = e.y - this.hold.y;

		}

		if ( this.last.x !== e.x || this.last.y !== e.y ) {

			this.last.set( this.x, this.y );

		}

		this.x = e.x;
		this.y = e.y;
		this.delta.x = e.x - this.last.x;
		this.delta.y = e.y - this.last.y;

		this.distance += this.delta.length();

		this.normalized.x = ( this.x / virtualElement.width ) * 2 - 1;
		this.normalized.y = - ( this.y / virtualElement.height ) * 2 + 1;

		this._tmp.x = this.normalized.x;
		this._tmp.y = this.normalized.y;
		this._tmp.z = 0.5;
		this._tmp.unproject( camera );
		const dir = this._tmp.sub( camera.position ).normalize();
		const dist = - camera.position.z / dir.z;
		this.world.copy( camera.position ).add( dir.multiplyScalar( dist ) );

		dispatcher.trigger(
			{
				name: 'pointerMove',
			},
			{
				pointer: this,
			}
		);

		if ( this.isTouching ) {

			dispatcher.trigger(
				{
					name: 'pointerDrag',
				},
				{
					pointer: this,
				}
			);

		}

	}

	onPointerup() {

		this.isTouching = false;
		this.move.set( 0, 0 );

		dispatcher.trigger(
			{
				name: 'pointerEnd',
			},
			{
				pointer: this,
			}
		);

	}

	onRaf() {

		const { pointerLerp, pointerLerpPrev, pointerLerpDelta, pointer } =
      store;

		if ( ! this.normalized ) return;
		pointer.copy( this.normalized );

		pointerLerp.x += pointer.x - pointerLerp.x;
		pointerLerp.y += pointer.y - pointerLerp.y;

		pointerLerpDelta.copy( pointerLerp ).sub( pointerLerpPrev );

		pointerLerpPrev.copy( pointerLerp );

		const vector = new THREE.Vector3(
			pointerLerp.x,
			pointerLerp.y,
			0.5
		).unproject( camera );

		const dir = vector.sub( camera.position ).normalize();

		// const distance = -camera.position.z / dir.z;

		const cameraViewMatrix = new THREE.Matrix4().copy(
			camera.matrixWorldInverse
		);

		const cameraRight = new THREE.Vector3().setFromMatrixColumn(
			cameraViewMatrix,
			0
		);

		const cameraUp = new THREE.Vector3().setFromMatrixColumn(
			cameraViewMatrix,
			1
		);

		const mouseVelocity = [];

		for ( let i = 0; i < 3; i ++ ) {

			mouseVelocity[ i ] =
        20 * pointerLerpDelta.x * cameraRight.getComponent( i ) +
        20 * pointerLerpDelta.y * cameraUp.getComponent( i );

		}

		mouseVec3.fromArray( mouseVelocity );

		velocityVec3.copy( dir );

		store.mouseVelocityRef = mouseVec3;
		store.mouseDirectionRef = velocityVec3;

	}

}

export default new Pointer();
