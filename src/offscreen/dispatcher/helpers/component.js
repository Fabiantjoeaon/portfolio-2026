import { store } from '@/offscreen/store';
import { disposeAll } from '@/offscreen/utils/disposeAll';
import dispatcher from '@/shared/dispatcher.js';

const activeComponents = new Map();

export function updateComponentRegistry( componentName, newModule ) {

	for ( const [ name, instance ] of activeComponents ) {

		if ( name === componentName ) {

			const params = instance._savedArgs || [];

			instance.dispose();
			// Add to the list instead of creating a new instance immediately
			const NewClass = newModule.default || newModule[ componentName ];
			console.log( '🏗️ HMR: Component updated:', componentName, newModule );
			if ( NewClass ) {

				new NewClass( ...params );
				console.log( '🏗️ HMR: Component updated:', componentName );

			}

		}

	}

}

const defaultRaf = {
	renderPriority: 0,
	fps: Infinity,
};
const component = (
	superclass = class T {},
	settings = {
		raf: defaultRaf,
	}
) =>
	class extends ( superclass || class T {} ) {

		constructor( ...args ) {

			super( ...args );
			this._savedArgs = args;

			this._args = args;
			this.raf = settings.raf || defaultRaf;
			this.init?.( ...args );
			this.lastUpdateTime = self.performance.now();
			dispatcher.register( this, this.raf );

			// hmr
			activeComponents.set( this.constructor.name, this );

		}

		destroy() {

			dispatcher.unregister( this );

		}
		dispose() {

			// unregister hmr
			this.destroy?.();

			const { scene } = store;
			scene.remove( this );
			if ( this.folder ) {

				this.folder.destroy();

			}

			disposeAll( this );

		}

	};

export { component };
