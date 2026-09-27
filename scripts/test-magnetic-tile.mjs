import assert from 'node:assert/strict';
import { test } from 'node:test';
import { magneticTile } from '../src/offscreen/scenes/PersistentScene/Grid/magneticTile.js';
const layout = { cols: 5, cellSize: 1, originX: 0, originY: 0, range: 0.75 };
const active = new Set([6, 8]);
test('range reaches a project from an adjacent empty cell', () => {
  assert.equal(magneticTile(1.9, 1, 7, active, layout), 6);
  assert.equal(magneticTile(1.9, 1, 7, active, { ...layout, range: 0 }), -1);
});
test('nearest project wins and direct project hits take priority', () => {
  assert.equal(magneticTile(2.2, 1, 7, active, layout), 8);
  assert.equal(magneticTile(2.2, 1, 6, active, layout), 6);
});
test('magnet releases beyond its radius and does not attract inactive tiles', () => {
  assert.equal(magneticTile(1, 3, 16, active, layout), -1);
  assert.equal(magneticTile(1, 1, 6, new Set(), layout), -1);
});
test('edge projects remain selectable just outside grid bounds', () => {
  assert.equal(magneticTile(-0.8, 0, -1, new Set([0]), layout), 0);
});
