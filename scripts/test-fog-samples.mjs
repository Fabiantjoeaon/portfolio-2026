import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fogSamples } from '../src/shared/fogSamples.js';

test('low DPR increases integration quality without reducing authored samples', () => {
  assert.equal(fogSamples(8, 2), 8);
  assert.equal(fogSamples(8, 1.5), 8);
  assert.equal(fogSamples(8, 1.25), 20);
  assert.equal(fogSamples(8, 1), 32);
  assert.equal(fogSamples(8, 0.5), 32);
  assert.equal(fogSamples(48, 1), 48);
  assert.equal(fogSamples(100, 0.5), 64);
});
