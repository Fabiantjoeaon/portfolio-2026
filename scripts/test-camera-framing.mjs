import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cameraFov } from '../src/shared/cameraFraming.js';
test('desktop preserves each authored FOV in either orientation', () => {
  for (const fov of [34,33.5,35]) for (const aspect of [.5,2])
    assert.equal(cameraFov({ fov, fovPortrait: 54, fovLandscape: 46 }, aspect, false), fov);
});
test('mobile reads the individual scene and orientation without imposing a global minimum', () => {
  const a = { fov: 34, fovPortrait: 52, fovLandscape: 42 };
  const b = { fov: 35, fovPortrait: 30, fovLandscape: 60 };
  assert.equal(cameraFov(a,.5,true),52);
  assert.equal(cameraFov(a,2,true),42);
  assert.equal(cameraFov(b,.5,true),30);
  assert.equal(cameraFov(b,2,true),60);
  a.fovPortrait=58;
  assert.equal(cameraFov(a,.5,true),58);
  assert.equal(cameraFov(b,.5,true),30);
});
test('scenes without mobile overrides retain their FOV', () => {
  assert.equal(cameraFov({ fov: 34 }, .5, true),34);
});
