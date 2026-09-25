import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { applyParamUpdates } from '../vite/saveParamsPlugin.js';
import GalleryMotion from '../src/offscreen/scenes/PersistentScene/GalleryMotion.js';
const settings = () => ({ galleryInputLerp: 0.16, gallerySnapLerp: 0.07, galleryWheelIdle: 0.24, galleryFlick: 0.1 });

const settle = motion => {
  for (let frame = 0; frame < 240; frame++) motion.update(1 / 60);
  assert.equal(motion.busy, false);
};

test('drag moves before release and snaps to the nearest slide', () => {
  const motion = new GalleryMotion(4, settings());
  motion.grab();
  motion.drag(0.65);
  motion.update(1 / 60);
  assert(motion.x > 0 && motion.x < 0.65);
  motion.release();
  settle(motion);
  assert.equal(motion.x, 1);
});

test('horizontal wheel accumulates input until idle, then snaps', () => {
  const motion = new GalleryMotion(4, settings());
  for (let i = 0; i < 5; i++) {
    motion.wheel(0.14);
    motion.update(0.05);
    assert.equal(motion.wheeling, true);
  }
  settle(motion);
  assert.equal(motion.x, 1);
});

test('repeated navigation wraps both ways and can reverse while moving', () => {
  const motion = new GalleryMotion(4, settings());
  motion.select({ step: -1 });
  settle(motion);
  assert.equal(motion.index, 3);
  motion.select({ step: 1 });
  motion.update(0.1);
  motion.select({ step: 1 });
  settle(motion);
  assert.equal(motion.index, 1);
  motion.select({ step: 1 });
  motion.update(0.1);
  motion.grab();
  const grabbedX = motion.x;
  motion.drag(-0.8);
  motion.release();
  settle(motion);
  assert.equal(motion.x, Math.round(grabbedX - 0.8));
});

test('damping is independent of frame rate and reduced motion is immediate', () => {
  const slow = new GalleryMotion(4, settings()), fast = new GalleryMotion(4, settings());
  slow.select({ step: 1 });
  fast.select({ step: 1 });
  for (let i = 0; i < 30; i++) slow.update(1 / 30);
  for (let i = 0; i < 120; i++) fast.update(1 / 120);
  assert(Math.abs(slow.x - fast.x) < 1e-12);
  fast.select({ index: 3, immediate: true });
  assert.equal(fast.index, 3);
  assert.equal(fast.busy, false);
});

test('live lerp settings change responsiveness without resetting position', () => {
  const config = settings();
  const motion = new GalleryMotion(4, config);
  motion.grab();
  motion.drag(1);
  config.galleryInputLerp = 0.05;
  motion.update(1 / 60);
  assert(Math.abs(motion.x - 0.05) < 1e-12);
  config.galleryInputLerp = 0.5;
  motion.update(1 / 60);
  assert(Math.abs(motion.x - 0.525) < 1e-12);
  motion.release();
  config.gallerySnapLerp = 1;
  motion.update(1 / 60);
  assert.equal(motion.x, 1);
});

test('gallery controls persist through the existing params saver', () => {
  const source = readFileSync(new URL('../src/offscreen/params.js', import.meta.url), 'utf8');
  for (const key of ['galleryInputLerp', 'gallerySnapLerp', 'galleryShaderLerp',
    'galleryBars', 'galleryOffset', 'gallerySpread', 'galleryStagger', 'galleryScale', 'galleryFade',
    'galleryRevealDistance', 'galleryWheelIdle', 'galleryFlick']) {
    const result = applyParamUpdates(source, {
      [`PersistentScene.Gallery.${key}`]: { type: 'number', value: 0.12345 },
    });
    assert.notEqual(result, source, `${key} must be writable`);
    assert.match(result, new RegExp(`${key}: \\{ value: 0\\.12345`));
  }
});
