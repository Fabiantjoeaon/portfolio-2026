import { bindDebugParams } from './bindDebugParams';
import { easingOptions, notifyTimingChange, timings } from '@/shared/timings';

const label = key => key
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/^./, character => character.toUpperCase());

function numberRange(key) {
  if (/lerp|At$|progress|factor/i.test(key)) return { min: 0, max: 1, step: 0.005 };
  if (/stagger/i.test(key)) return { min: 0, max: 3, step: 0.01 };
  return { min: 0, max: 15, step: 0.01 };
}

export function attachTimingsDebug(gui) {
  if (!gui || gui._timingsBound) return [];
  gui._timingsBound = true;

  return bindDebugParams(gui, Object.entries(timings).flatMap(([group, values]) =>
    Object.keys(values).map(key => ({
      object: values,
      property: key,
      folder: label(group),
      name: label(key),
      onChange: () => notifyTimingChange(group, key),
      ...(key.toLowerCase().includes('ease')
        ? { type: 'select', options: easingOptions }
        : numberRange(key)),
    })),
  ));
}
