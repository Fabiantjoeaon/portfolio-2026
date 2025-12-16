const isWindows = () => {

	const ua = typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : '';
	return /Win/.test( ua );

};

const isSafari = () => {

	const ua = typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : '';
	const isSafari =
    ua.indexOf( 'Safari' ) !== - 1 &&
    ua.indexOf( 'Chrome' ) === - 1 &&
    ua.indexOf( 'Chromium' ) === - 1 &&
    ua.indexOf( 'Android' ) === - 1 &&
    ua.indexOf( 'CriOS' ) === - 1 &&
    ua.indexOf( 'FxiOS' ) === - 1;
	return isSafari;

};

const isIOS = () => {

	const ua = typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : '';
	return /iPhone|iPad|iPod/i.test( ua ) || isIpadExtraCheck();

};

const isMobileOrTablet = () => {

	const ua = typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : '';
	const hasWindow = typeof window !== 'undefined';
	const msStream = hasWindow && 'MSStream' in window ? window.MSStream : undefined;

	return (
		( ( /iPad|iPhone|iPod/.test( ua ) ) && ! msStream ) ||
    /android/i.test( ua ) ||
    isIpadExtraCheck()
	);

};

const isIpadExtraCheck = () => {

	const ua = typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : '';
	const hasNavigator = typeof navigator !== 'undefined';
	const touchPoints = hasNavigator && typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0;
	return /Macintosh/.test( ua ) && touchPoints > 0;

};

const isTouchDevice = () => {

	const hasWindow = typeof window !== 'undefined';
	const hasNavigator = typeof navigator !== 'undefined';
	const hasTouchStart = hasWindow && 'ontouchstart' in window;
	const touchPoints = hasNavigator && typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0;
	return hasTouchStart || touchPoints > 0;

};

export { isIOS, isMobileOrTablet, isSafari, isTouchDevice, isWindows };
