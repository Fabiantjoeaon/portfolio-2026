import test from 'node:test';
import assert from 'node:assert/strict';
import { InstancedBufferAttribute } from 'three/webgpu';
import { RoseTrail } from '../src/offscreen/scenes/MeadowScene/RoseTrail.js';

function pool(births) {
  const trail = Object.create(RoseTrail.prototype);
  trail.controls = { lifetime: { value: 2.5 }, degrowDuration: { value: 2 } };
  trail._activeCount = births.length;
  trail.roses = { geometry: { instanceCount: births.length } };
  trail.attributes = {
    birth: new InstancedBufferAttribute(new Float32Array(births), 1),
    offset: new InstancedBufferAttribute(Float32Array.from(births.flatMap((_, i) => [i, -i])), 2),
    variation: new InstancedBufferAttribute(Float32Array.from(births.flatMap((_, i) => [i, i + 1, i + 2, i + 3])), 4),
  };
  return trail;
}

test('retains roses through the full degrowth, then stops drawing them', () => {
  const trail = pool([0]);
  trail._retireExpired(4.499);
  assert.equal(trail.roses.geometry.instanceCount, 1);
  assert.equal(trail.attributes.birth.version, 0);
  trail._retireExpired(4.5);
  assert.equal(trail.roses.geometry.instanceCount, 0);
  assert.equal(trail._availableSlot(4.5), 0);
});

test('compaction preserves every surviving rose’s birth, position and variation', () => {
  const trail = pool([0, 8, 2, 9]);
  trail._retireExpired(10);
  assert.equal(trail._activeCount, 2);
  assert.equal(trail.roses.geometry.instanceCount, 2);
  assert.deepEqual([...trail.attributes.birth.array.slice(0, 2)], [8, 9]);
  assert.deepEqual([...trail.attributes.offset.array.slice(0, 4)], [1, -1, 3, -3]);
  assert.deepEqual([...trail.attributes.variation.array.slice(0, 8)], [1, 2, 3, 4, 3, 4, 5, 6]);
  assert.equal(trail._availableSlot(10), 2);
});

test('a full live pool cannot be overwritten; expired capacity is reusable', () => {
  const trail = pool(Array(64).fill(10));
  assert.equal(trail._availableSlot(12), -1);
  assert.equal(trail._availableSlot(14.5), 0);
  assert.equal(trail.roses.geometry.instanceCount, 0);
});
