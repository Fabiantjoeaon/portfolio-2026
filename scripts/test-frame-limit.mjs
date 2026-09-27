import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FrameLimit } from '../src/shared/frameLimit.js';

for (const hz of [30, 60, 75, 90, 120, 144, 165, 240]) {
  test(`${hz}Hz display renders at most 60fps without dropping to a lower divisor`, () => {
    const limit = new FrameLimit();
    let frames = 0;
    for (let i = 0; i < hz * 10; i++) {
      if (limit.accept(i * 1000 / hz)) frames++;
    }
    assert.equal(frames, Math.min(hz, 60) * 10);
  });
}

test('a long stall resumes once without a catch-up burst', () => {
  const limit = new FrameLimit();
  assert(limit.accept(0));
  assert(limit.accept(2000));
  for (const now of [2000, 2001, 2004, 2008, 2012]) assert(!limit.accept(now));
  assert(limit.accept(2017));
});

test('small timestamp jitter does not halve a 60Hz display cadence', () => {
  const limit = new FrameLimit();
  for (let i = 0; i < 600; i++) {
    assert(limit.accept(i * 1000 / 60 + (i % 2 ? 0.03 : 0)));
  }
});
