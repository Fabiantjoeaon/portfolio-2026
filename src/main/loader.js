
export const initLoader = ( dispatcher ) => {

	const dom = document.createElement( 'div' );
	dom.id = 'loader-overlay';
	dom.innerHTML = `
		<style>
			#loader-overlay {
				position: fixed;
				top: 0;
				left: 0;
				width: 100%;
				height: 100%;
				background: black;
				z-index: 10000;
				display: flex;
				justify-content: center;
				align-items: center;
				transition: opacity 0.5s ease-out;
			}
			.progress-bar-container {
				width: 200px;
				height: 4px;
				background: rgba(255, 255, 255, 0.2);
				border-radius: 2px;
				overflow: hidden;
			}
			.progress-bar {
				width: 100%;
				height: 100%;
				background: white;
				transform-origin: left;
				transform: scaleX(0);
				transition: transform 0.2s linear;
			}
		</style>
		<div class="progress-bar-container">
			<div class="progress-bar"></div>
		</div>
	`;

	document.body.appendChild( dom );

	const bar = dom.querySelector( '.progress-bar' );

	const setProgress = ( value ) => {

		bar.style.transform = `scaleX(${value / 100})`;

	};

	dispatcher.on( 'loadProgress', ( { progress } ) => {

		// Asset loader reports 0–100; reserve the last 5% for GPU preparation.
		const p = Math.max( 0, Math.min( progress, 100 ) );
		const visualProgress = p * 0.95;
		setProgress( visualProgress );

	} );

	dispatcher.on( 'compileEnd', () => {

		setProgress( 100 );

		setTimeout( () => {

			dom.style.opacity = '0';
			setTimeout( () => {

				dom.remove();

			}, 500 );

		}, 200 );

	} );

};
