import assert from 'node:assert/strict';
import { test } from 'node:test';
import { touchCursorPoint, touchGridLayout, touchProjectAtPoint, uniqueProjectTiles } from '../src/shared/touchLayout.js';
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
test('the mobile cursor starts on a non-project tile', () => {
  const positions = PROJECTS.map(project => project.pos);
  for (const [width, height] of [[320, 568], [390, 844], [393, 852], [430, 932], [844, 390], [768, 1024]]) {
    const point = touchCursorPoint(width, height, positions);
    assert.equal(touchProjectAtPoint(width, height, point.x, point.y, positions), -1);
    assert.equal(point.x, width / 2);
    assert.equal(point.y, height / 2);
  }
  // Browser chrome makes innerHeight shorter than the canvas. That raised
  // point is what used to open a project on load.
  assert.notEqual(touchProjectAtPoint(390, 844, 195, 335, positions), -1);
});
test('the cursor steps off a project that sits on the canvas center', () => {
  const width = 390, height = 844;
  const layout = touchGridLayout(width, height, 1);
  const positions = [[5 / (layout.cols - 1), 5 / (layout.rows - 1)]];
  assert.notEqual(touchProjectAtPoint(width, height, width / 2, height / 2, positions), -1);
  const point = touchCursorPoint(width, height, positions);
  assert.equal(touchProjectAtPoint(width, height, point.x, point.y, positions), -1);
  assert.ok(point.y !== height / 2 || point.x !== width / 2);
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
  assert.equal(desktop.left, (1440 - desktop.mediaWidth) / 2);
});
test('mobile gallery shares the page gutter; desktop stays centered', () => {
  for (const [width, height] of [[390, 844], [390, 664], [320, 568], [430, 740]]) {
    const phone = projectLayout(width, height, true);
    const gutter = Math.min(64, Math.max(20, width * 0.03));
    assert.equal(phone.left, gutter);
    assert.equal(phone.mediaWidth, width - gutter * 2);
    assert.equal(phone.gap, 12);
    const portraitLift = 40;
    const fitted = phone.heroHeight + portraitLift;
    assert.equal(phone.top, (fitted - phone.mediaHeight) / 2 - portraitLift);
    assert(phone.top >= 150 && phone.heroHeight - phone.top - phone.mediaHeight >= 200);
  }
  const wide = projectLayout(1440, 900, false);
  assert.notEqual(wide.left, Math.min(64, Math.max(20, 1440 * 0.03)));
});
