import dispatcher from '@/shared/dispatcher';
import { store } from '@/offscreen/store';

// Get GPU/WebGL info

export const getWebglInfo = () => {

	const gl = store.gl.backend.gl;
	const debugInfo = gl.getExtension( 'WEBGL_debug_renderer_info' );
	const vendor = gl.getParameter( debugInfo.UNMASKED_VENDOR_WEBGL );
	const renderer = gl.getParameter( debugInfo.UNMASKED_RENDERER_WEBGL );
	return { vendor, renderer };

};

export const isLowSpeedVendor = ( vendor, gpuModel ) => {

	if ( ! vendor && ! gpuModel ) {

		return false;

	}

	if ( typeof vendor !== 'string' && typeof gpuModel !== 'string' ) {

		return false;

	}

	return (
		vendor?.toLowerCase().includes( 'intel' ) ||
		vendor?.toLowerCase().includes( 'amd' ) ||
		gpuModel?.toLowerCase().includes( 'radeon pro rx' )
	);

};

async function getRendererInfo() {

	if ( store.isWebGPU ) {

		try {

			const adapter = await navigator.gpu.requestAdapter();
			if ( adapter === null ) {

				return 'Unable to create WebGPU adapter';

			}

			const { vendor, architecture, device, description } = adapter.info;
			return `
        Vendor: ${vendor}
        Architecture: ${architecture}
  ${device ? `Device: ${device}` : ''}
  ${description ? `Description: ${description}` : ''}`;

		} catch ( error ) {

			return `Error getting WebGPU info: ${error.message}`;

		}

	} else {

		try {

			const { vendor, renderer } = getWebglInfo();
			return `
        Vendor: ${vendor}
        Renderer: ${renderer}`;

		} catch ( error ) {

			return `Error getting WebGL info: ${error.message}`;

		}

	}

}

const debugInfo = async () => {

	const threadType =
    typeof window === 'undefined'
    	? 'WORKER THREAD (OffScreenCanvas)'
    	: 'MAIN THREAD';
	const renderBackend = store.isWebGPU ? 'WebGPU' : 'WebGL';
	const hardwareInfo = await getRendererInfo();

	dispatcher.trigger(
		{ name: 'debugInfos' },
		{
			threadType,
			renderBackend,
			hardwareInfo,
		}
	);

};

export default debugInfo;
