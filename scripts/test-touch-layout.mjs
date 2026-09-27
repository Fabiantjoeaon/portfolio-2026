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
    assert(layout.cols * layout.rows > 108 && layout.cols * layout.rows <= 154);
    assert(layout.tileSize > 0);
    assert(Math.abs(layout.tileSize / layout.cellSize - 0.9) < 1e-10);
    assert.deepEqual(indices, uniqueProjectTiles(PROJECTS.map(p => p.pos), layout.cols, layout.rows));
  });
}
test('colliding positions cannot overwrite another project', () => {
  assert.equal(new Set(uniqueProjectTiles(Array.from({length: 48}, () => [0.5,0.5]),6,8)).size,48);
});
test('layout grows to accommodate additional active projects', () => {
  const layout = touchGridLayout(390,844,200);
  assert(layout.cols * layout.rows >= 200);
});

// The same layout feeds the DOM hit areas and GPU screen/gallery geometry.
import { projectLayout } from '../src/shared/projectLayout.js';
test('touch media stays portrait in either orientation; desktop stays widescreen', () => {
  for (const [width, height] of [[390,844],[844,390]]) {
    const layout = projectLayout(width, height, true);
    assert.equal(layout.mediaWidth / layout.mediaHeight, 3 / 4);
    assert(layout.top > 0);
  }
  const desktop = projectLayout(1440,900);
  assert.equal(desktop.mediaWidth / desktop.mediaHeight, 16 / 9);
});
