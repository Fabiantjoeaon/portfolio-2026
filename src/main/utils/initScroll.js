import Lenis from 'lenis';
import { store } from '@/offscreen/store';
import loop from '@/main/utils/loop';
import dispatcher from '@/shared/dispatcher.js';
import { gsap } from 'gsap';

export const initScroll = ( api ) => {

	const lenis = new Lenis( {
		syncTouch: true,
		smoothWheel: true,
		// smooth: 2,
		// normalizeScroll: false,
		// normalizeWheel: false,
		// ignoreMobileResize: true,
		// effects: true,
		// preventDefault: true,
		// lerp: 0.01,
		// wrapper: document.body,
	} );

	lenis.on( 'scroll', ( e ) => {

		store.scroll = e.progress;
		api.trigger(
			{
				name: 'scroll',
			},
			{
				progress: e.progress,
				direction: e.direction,
			}
		);

	} );

	dispatcher.on( 'lenis:scrollTo', ( { target, options } ) => {

		lenis.scrollTo( target, options );

	} );

	gsap.ticker.lagSmoothing( 0 );
	gsap.ticker.remove( gsap.updateRoot );

	lenis.scrollTo( 0, {
		immediate: true,
	} );

	loop.addCallback( ( time ) => {

		// make sure the loop is in milliseconds
		gsap.updateRoot( time / 1000 );
		lenis.raf( time );

	} );

};
