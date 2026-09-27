import assert from 'node:assert/strict';
import { test } from 'node:test';
import { touchGridLayout, uniqueProjectTiles } from '../src/shared/touchLayout.js';
import { PROJECTS } from '../src/shared/projects.js';

for (const [width, height] of [[320,568],[390,844],[844,390],[768,1024]]) {
  test(`every project gets a unique reachable tile at ${width}×${height}`, () => {
    const layout = touchGridLayout(width, height, PROJECTS.length);
    const indices = uniqueProjectTiles(PROJECTS.map(p => p.pos), layout.cols, layout.rows);
    assert.equal(new Set(indices).size, PROJECTS.length);
    assert(indices.every(i => i >= 0 && i < layout.cols * layout.rows));
    assert(layout.cols * layout.rows <= 50);
    assert(layout.tileSize > 0);
    assert.deepEqual(indices, uniqueProjectTiles(PROJECTS.map(p => p.pos), layout.cols, layout.rows));
  });
}
test('colliding positions cannot overwrite another project', () => {
  assert.equal(new Set(uniqueProjectTiles(Array.from({length: 48}, () => [0.5,0.5]),6,8)).size,48);
});
test('layout grows to accommodate additional active projects', () => {
  const layout = touchGridLayout(390,844,60);
  assert(layout.cols * layout.rows >= 60);
});
