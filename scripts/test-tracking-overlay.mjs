import test from "node:test";
import assert from "node:assert/strict";
import { segmentIntersectsBounds } from "../src/offscreen/effects/trackingMath.js";

const min = { x: -1, y: -1, z: -1 };
const max = { x: 1, y: 1, z: 1 };

test("screen exclusion rejects crossing, grazing and contained segments", () => {
  assert.equal(segmentIntersectsBounds({ x: -3, y: 0 }, { x: 3, y: 0 }, min, max, 2), true);
  assert.equal(segmentIntersectsBounds({ x: -3, y: 1 }, { x: 3, y: 1 }, min, max, 2), true);
  assert.equal(segmentIntersectsBounds({ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, min, max, 2), true);
  assert.equal(segmentIntersectsBounds({ x: -3, y: 2 }, { x: 3, y: 2 }, min, max, 2), false);
  assert.equal(segmentIntersectsBounds({ x: -2, y: 0 }, { x: 0, y: 3 }, min, max, 2), false);
});

test("solid wall blocks penetration but allows connections in front of its surface", () => {
  assert.equal(segmentIntersectsBounds({ x: 0, y: 0, z: 3 }, { x: 0, y: 0, z: -3 }, min, max), true);
  assert.equal(segmentIntersectsBounds({ x: -3, y: 0, z: 1.1 }, { x: 3, y: 0, z: 1.1 }, min, max), false);
  assert.equal(segmentIntersectsBounds({ x: -3, y: 0, z: 1 }, { x: 3, y: 0, z: 1 }, min, max), true);
});

test("blocking is symmetric, including parallel and zero-length segments", () => {
  const a = { x: -3, y: -2, z: 0 }, b = { x: 3, y: 2, z: 0 };
  assert.equal(segmentIntersectsBounds(a, b, min, max), segmentIntersectsBounds(b, a, min, max));
  assert.equal(segmentIntersectsBounds(a, a, min, max), false);
  assert.equal(segmentIntersectsBounds({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, min, max), true);
});
