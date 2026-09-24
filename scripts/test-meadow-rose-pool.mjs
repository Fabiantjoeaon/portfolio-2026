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
    colorChoice: new InstancedBufferAttribute(Float32Array.from(births.map((_, i) => i % 5)), 1),
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

test('compaction preserves every surviving rose’s birth, position, variation and color', () => {
  const trail = pool([0, 8, 2, 9]);
  trail._retireExpired(10);
  assert.equal(trail._activeCount, 2);
  assert.equal(trail.roses.geometry.instanceCount, 2);
  assert.deepEqual([...trail.attributes.birth.array.slice(0, 2)], [8, 9]);
  assert.deepEqual([...trail.attributes.offset.array.slice(0, 4)], [1, -1, 3, -3]);
  assert.deepEqual([...trail.attributes.variation.array.slice(0, 8)], [1, 2, 3, 4, 3, 4, 5, 6]);
  assert.deepEqual([...trail.attributes.colorChoice.array.slice(0, 2)], [1, 3]);
  assert.equal(trail._availableSlot(10), 2);
});

test('a full live pool recycles its oldest rose; expired capacity remains reusable', () => {
  const births = Array.from({ length: 64 }, (_, index) => 10 + index * 0.01);
  births[37] = 4;
  const trail = pool(births);
  assert.equal(trail._availableSlot(7), 37);
  assert.equal(trail._availableSlot(14.5), 62);
  assert.equal(trail.roses.geometry.instanceCount, 62);

  const expired = pool(Array(64).fill(10));
  assert.equal(expired._availableSlot(14.5), 0);
  assert.equal(expired.roses.geometry.instanceCount, 0);
});
