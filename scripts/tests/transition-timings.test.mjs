import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTimingContext, easingOptions, sharedTimings, transitionTimings,
} from '../../src/shared/timings.js';

test('every supported route has one profile with valid controls and no shared duplicates', () => {
  assert.deepEqual(Object.keys(transitionTimings).sort(), [
    'loaderToHome', 'loaderToProject', 'loaderToAbout', 'homeToProject',
    'homeToAbout', 'projectToProject', 'projectToHome', 'projectToAbout',
    'aboutToProject', 'aboutToHome',
  ].sort());
  const objects = new Set();
  for (const profile of Object.values(transitionTimings)) {
    for (const [group, values] of Object.entries(profile)) {
      assert.ok(!objects.has(values), `${group} must not share a mutable object`);
      objects.add(values);
      for (const [key, value] of Object.entries(values)) {
        assert.ok(!(key in (sharedTimings[group] ?? {})), `${group}.${key} appears twice`);
        assert.ok(typeof value === 'number' ? Number.isFinite(value) : value in easingOptions,
          `${group}.${key} must be a valid number or easing`);
      }
    }
  }
});

test('route edits stay independent and retained group references select live values', () => {
  const context = createTimingContext();
  const screen = context.timings.pages;
  const first = transitionTimings.homeToProject.pages;
  const second = transitionTimings.homeToAbout.pages;
  const original = first.pageScreenDuration;
  try {
    first.pageScreenDuration = 0;
    context.select('home', 'project');
    assert.equal(screen.pageScreenDuration, 0);
    context.select('home', 'about');
    assert.equal(screen.pageScreenDuration, second.pageScreenDuration);
    context.select('home', 'project');
    assert.equal(screen.pageScreenDuration, 0);
  } finally { first.pageScreenDuration = original; }
});

test('queued DOM navigation cannot select a different GPU profile', () => {
  const gpu = createTimingContext();
  const dom = createTimingContext();
  const profile = transitionTimings.aboutToProject.text;
  const original = profile.projectIn;
  try {
    profile.projectIn = 4.2;
    gpu.select('home', 'project');
    dom.select('about', 'project');
    assert.equal(dom.timings.text.projectIn, 4.2);
    assert.equal(gpu.timings.text.projectIn, transitionTimings.homeToProject.text.projectIn);
    assert.equal(dom.select('about', 'about'), false);
    assert.equal(dom.timings.text.projectIn, 4.2);
  } finally { profile.projectIn = original; }
});

test('loader destinations and home return sources use independent choreography', () => {
  const context = createTimingContext();
  for (const destination of ['home', 'project', 'about']) {
    assert.equal(context.select('loader', destination), true);
    assert.ok(Number.isFinite(context.timings.startup.wipeDuration));
    assert.ok(Number.isFinite(context.timings.loader.fadeDuration));
  }
  assert.notEqual(transitionTimings.projectToHome.homeReturn, transitionTimings.aboutToHome.homeReturn);
  assert.ok(!transitionTimings.projectToProject.pages, 'same-scene switches have no wipe controls');
  for (const route of ['loaderToProject', 'loaderToAbout']) {
    assert.ok('pageFade' in transitionTimings[route].startup, 'deep links fade up from black');
    assert.ok(!('wipeDuration' in transitionTimings[route].startup), 'deep links skip the world wipe');
  }
  assert.ok(transitionTimings.loaderToProject.projectSky.inDuration, 'the deep-linked sky enters from black');
});

test('writes through stable views affect only the selected route', () => {
  const context = createTimingContext();
  context.select('project', 'project');
  const original = context.timings.gallery.outEase;
  try {
    context.timings.gallery.outEase = 'linear';
    assert.equal(transitionTimings.projectToProject.gallery.outEase, 'linear');
    assert.equal(transitionTimings.projectToHome.gallery.outEase, 'pageEase');
    assert.equal(transitionTimings.projectToProject.gallery.inEase, 'pageEase');
  } finally { context.timings.gallery.outEase = original; }
});

test('all tile animation settings live in Shared and apply across routes', () => {
  const context = createTimingContext();
  const original = sharedTimings.tiles.duration;
  try {
    sharedTimings.tiles.duration = 2.7;
    for (const [route, profile] of Object.entries(transitionTimings)) {
      assert.ok(!profile.tiles);
      assert.ok(!('tilesDuration' in (profile.startup ?? {})));
      assert.ok(!('tilesDuration' in (profile.homeReturn ?? {})));
      const [from, to] = route.split('To');
      context.select(from, to.toLowerCase());
      assert.equal(context.timings.tiles.duration, 2.7);
    }
    assert.equal(sharedTimings.tiles.startupDuration, 2.4);
    assert.equal(sharedTimings.tiles.returnDuration, 1.5);
  } finally { sharedTimings.tiles.duration = original; }
});
