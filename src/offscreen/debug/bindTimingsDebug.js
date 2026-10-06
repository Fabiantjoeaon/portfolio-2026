import { attachSaveParamsButton, registerSaveSource, saveParamsToFile } from "./saveParams";
import { bindDebugParams } from './bindDebugParams';
import { collectTimingSettings, easingOptions, notifyTimingChange, sharedTimings, transitionTimings } from '@/shared/timings';

const label = key => key
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/^./, character => character.toUpperCase());

function numberRange(key) {
  if (/fps/i.test(key)) return { min: 1, max: 120, step: 1 };
  if (/delayResolve/i.test(key)) return { min: 0, max: 0.95, step: 0.01 };
  if (key === 'interactionDelay' || key === 'audioDelay') return { min: 0, max: 2, step: 0.01 };
  if (/lerp|At$|Until$|End$|progress|factor|^cameraDelay$/i.test(key)) return { min: 0, max: 1, step: 0.005 };
  if (/stagger/i.test(key)) return { min: 0, max: 3, step: 0.01 };
  return { min: 0, max: 15, step: 0.01 };
}

/** Saving any debug panel also writes the timing overrides. */
export function registerTimingsSave() {
  registerSaveSource('timingOverrides', () => {
    const settings = collectTimingSettings();
    const countLeaves = value => typeof value === 'object'
      ? Object.values(value).reduce((sum, child) => sum + countLeaves(child), 0) : 1;
    return { content: `${JSON.stringify(settings, null, 2)}\n`, count: countLeaves(settings) };
  });
}

/** Controls for one timing group's values, placed in `folder`. */
export const timingControls = (group, values, folder) => Object.keys(values).map(key => ({
  object: values,
  property: key,
  folder,
  name: label(key),
  onChange: () => notifyTimingChange(group, key, values[key]),
  ...(key.toLowerCase().includes('ease')
    ? { type: 'select', options: easingOptions }
    : numberRange(key)),
}));

export function attachTimingsDebug(gui) {
  if (!gui || gui._timingsBound) return [];
  gui._timingsBound = true;
  registerTimingsSave();
  attachSaveParamsButton(gui, {
    label: 'Save timings',
    save: () => saveParamsToFile({ onlySources: ['timingOverrides'] }),
  });

  const controls = (groups, prefix = '') => Object.entries(groups)
    .flatMap(([group, values]) => timingControls(group, values, `${prefix}${label(group)}`));
  const bound = bindDebugParams(gui, [
    ...Object.entries(transitionTimings).flatMap(([route, groups]) =>
      controls(groups, `${route.replace('To', ' > ').toUpperCase()}/`)),
    ...controls(sharedTimings, 'Shared/'),
  ]);
  gui.foldersRecursive().forEach(folder => folder.close());
  return bound;
}
