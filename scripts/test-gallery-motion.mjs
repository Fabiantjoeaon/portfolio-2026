import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { applyParamUpdates } from '../vite/saveParamsPlugin.js';
import GalleryMotion, { damp } from '../src/offscreen/scenes/PersistentScene/GalleryMotion.js';
import { easingDefinitions, notifyTimingChange, onTimingChange, timings } from '../src/shared/timings.js';
const settings = () => ({
  galleryLerp: 0.27, galleryDragLerp: 0.1, galleryDragSensitivity: 1, galleryScrollSensitivity: 1,
  gallerySpeedDecay: 0.85, gallerySettleDistance: 0.02, galleryWheelIdle: 0.24, galleryFlickVelocity: 0.4,
});

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

test('a short flick advances one slide in its direction', () => {
  const motion = new GalleryMotion(4, settings());
  motion.grab();
  motion.drag(0.08);
  motion.release(1.2);
  settle(motion);
  assert.equal(motion.x, 1);
  motion.grab();
  motion.drag(0.3);
  motion.release(-0.8);
  settle(motion);
  assert.equal(motion.x, 1);
  motion.grab();
  motion.drag(0.2);
  motion.release(0.1);
  settle(motion);
  assert.equal(motion.x, 1);
});

test('release keeps the drag velocity instead of restarting from rest', () => {
  const motion = new GalleryMotion(4, settings());
  motion.grab();
  for (let i = 1; i <= 10; i++) { motion.drag(i * 0.05); motion.update(1 / 60); }
  const before = motion.velocity;
  assert(before > 0);
  motion.release(before);
  assert.equal(motion.velocity, before);
  motion.update(1 / 60);
  assert(motion.velocity > 0);
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

test('a trackpad momentum tail cannot carry past one slide, a new swipe can', () => {
  const motion = new GalleryMotion(6, settings());
  for (const delta of [0.1, 0.3, 0.4, 0.3, 0.2, 0.15, 0.1, 0.08, 0.05, 0.03]) {
    motion.wheel(delta);
    motion.update(1 / 60);
  }
  assert.equal(motion.targetX, 1);
  for (const delta of [0.02, 0.06, 0.2, 0.4]) {
    motion.wheel(delta);
    motion.update(1 / 60);
  }
  settle(motion);
  assert.equal(motion.x, 2);
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
  for (let i = 0; i < 12; i++) slow.update(1 / 30);
  for (let i = 0; i < 48; i++) fast.update(1 / 120);
  assert(slow.x > 0.5 && slow.x < 1);
  assert(Math.abs(slow.x - fast.x) < 1e-9);
  fast.select({ index: 3, immediate: true });
  assert.equal(fast.index, 3);
  assert.equal(fast.busy, false);
});

test('live lerp settings change responsiveness without resetting position', () => {
  const config = settings();
  const motion = new GalleryMotion(4, config);
  motion.grab();
  motion.drag(1);
  config.galleryDragLerp = 0.05;
  motion.update(1 / 60);
  const first = damp(0, 1, 0.05, 1 / 60);
  assert(Math.abs(motion.x - first) < 1e-12);
  config.galleryDragLerp = 0.5;
  motion.update(1 / 60);
  assert(Math.abs(motion.x - damp(first, 1, 0.5, 1 / 60)) < 1e-12);
  motion.release();
  config.galleryLerp = 0.02;
  for (let i = 0; i < 12; i++) motion.update(1 / 60);
  assert.equal(motion.x, 1);
});

test('speed follows the motion and decays back to rest', () => {
  const motion = new GalleryMotion(4, settings());
  motion.select({ step: 1 });
  for (let i = 0; i < 10; i++) motion.update(1 / 60);
  assert(motion.speed > 0);
  assert.equal(motion.settled, false);
  settle(motion);
  assert.equal(motion.speed, 0);
  assert.equal(motion.settled, true);
});

test('gallery controls persist through the existing params saver', () => {
  const source = readFileSync(new URL('../src/offscreen/params.js', import.meta.url), 'utf8');
  for (let key of ['galleryFlickVelocity', 'galleryFillBelow', 'Motion.galleryLerp', 'Motion.galleryLerpMobile',
    'Card.cardTilt', 'Card.cardBend', 'Frame.frameGlitch', 'Glass.glassRefraction', 'Label.cardLabelSize']) {
    const result = applyParamUpdates(source, {
      [`PersistentScene.Gallery.${key}`]: { type: 'number', value: 0.12345 },
    });
    key = key.split('.').pop();
    assert.notEqual(result, source, `${key} must be writable`);
    assert.match(result, new RegExp(`${key}: \\{ value: 0\\.12345`));
  }
});

test('page timing controls have a single owner outside params and debug bindings', () => {
  const source = readFileSync(new URL('../src/offscreen/params.js', import.meta.url), 'utf8');
  for (const group of [timings.gallery, timings.pages]) {
    for (const key of Object.keys(group)) assert(!new RegExp(`\\b${key}:`).test(source), `${key} must only live in timings`);
  }
  for (const key of ['screenHoverIn', 'screenHoverOut', 'tilesOutDuration', 'tilesOutSpread', 'portraitRevealDuration', 'wallRevealDuration'])
    assert(!source.includes(`${key}:`), `${key} was moved to timings`);
});

test('every timing easing comes from the single easing definition list', () => {
  const names = easingDefinitions.map(({ name }) => name);
  assert.equal(new Set(names).size, names.length, 'easing names must be unique');
  const configured = Object.values(timings).flatMap(group =>
    Object.entries(group).filter(([key]) => key.toLowerCase().includes('ease')).map(([, value]) => value));
  for (const ease of configured) assert(names.includes(ease), `${ease} must be available in the easing dropdown`);
});

test('timing edits notify long-lived runtime consumers', () => {
  const changes = [];
  const remove = onTimingChange(change => changes.push(change));
  notifyTimingChange('scroll', 'duration');
  remove();
  assert.deepEqual(changes, [{ group: 'scroll', key: 'duration', value: timings.scroll.duration }]);
});
