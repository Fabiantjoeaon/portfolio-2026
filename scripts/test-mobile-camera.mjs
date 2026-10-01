import assert from 'node:assert/strict';
import test from 'node:test';
import { cameraLookAt } from '../src/shared/cameraFraming.js';

const pose = () => ({ position: { x: 3, y: 12, z: 28 }, lookAt: { x: 0, y: 2, z: -4 }, mobilePitchDown: 2 });
const angle = (state, look) => Math.atan2(look.y - state.position.y,
  Math.hypot(look.x - state.position.x, look.z - state.position.z));
const distance = (state, look) => Math.hypot(look.x-state.position.x,look.y-state.position.y,look.z-state.position.z);

test('touch meadow pitch lowers the sightline by the requested degrees without changing distance or authored pose', () => {
  const state = pose(), original = structuredClone(state);
  const look = cameraLookAt(state, true);
  assert.ok(Math.abs(angle(state, state.lookAt)-angle(state, look)-2*Math.PI/180)<1e-12);
  assert.ok(Math.abs(distance(state, look)-distance(state, state.lookAt))<1e-12);
  assert.deepEqual(state, original);
});

test('desktop and scenes without touch pitch keep their authored target', () => {
  assert.deepEqual(cameraLookAt(pose(), false), pose().lookAt);
  const state = pose(); delete state.mobilePitchDown;
  assert.deepEqual(cameraLookAt(state, true), state.lookAt);
});

test('resolving transition endpoints repeatedly never accumulates the pitch', () => {
  const state=pose(), target={};
  const expected=cameraLookAt(state,true);
  for(let i=0;i<100;i++) assert.deepEqual(cameraLookAt(state,true,target),expected);
  state.mobilePitchDown=3;
  const live=cameraLookAt(state,true,target);
  assert.ok(Math.abs(angle(state,state.lookAt)-angle(state,live)-3*Math.PI/180)<1e-12);
});

import { cameraPosition } from '../src/shared/cameraFraming.js';
import { bindMobileCamera, mobileSettings } from '../src/shared/mobileSettings.js';

test('every scene has independent live pitch and Z offset with no desktop changes', () => {
  for (const name of ['cube','meadow','ice','about','project']) {
    const state=bindMobileCamera(pose(),name);
    const pitchKey=`${name}CameraPitchDown`, zKey=`${name}CameraZOffset`;
    const oldPitch=mobileSettings[pitchKey],oldZ=mobileSettings[zKey];
    try {
      mobileSettings[pitchKey]=4;mobileSettings[zKey]=7;
      assert.equal(state.mobilePitchDown,4);
      assert.equal(cameraPosition(state,true).z,state.position.z+7);
      assert.deepEqual(cameraPosition(state,false),state.position);
      assert.deepEqual(cameraLookAt(state,false),state.lookAt);
      const position=cameraPosition(state,true),look=cameraLookAt(state,true);
      const elevated={...state,position};
      assert.ok(Math.abs(angle(elevated,state.lookAt)-angle(elevated,look)-4*Math.PI/180)<1e-12);
      mobileSettings[zKey]=3;
      assert.equal(cameraPosition(state,true).z,state.position.z+3);
    } finally {mobileSettings[pitchKey]=oldPitch;mobileSettings[zKey]=oldZ;}
  }
});
