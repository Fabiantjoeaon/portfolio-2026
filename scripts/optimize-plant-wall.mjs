// Recompresses plant-wall.glb geometry; textures, positions, UVs and COLOR_0 pass
// through unchanged. Normals get meshopt's 8-bit octahedral filter and vertex
// streams use the v1 codec, which glTF only allows under KHR_meshopt_compression
// (three r186+). glTF-Transform knows the EXT name, so the JSON is renamed around it.
//   node scripts/optimize-plant-wall.mjs [input] [output]
import { readFileSync, writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const path = 'public/assets/models/meadow/plant-wall.glb';
const [input = path, output = input] = process.argv.slice(2);

// Same length, so no chunk or buffer offsets move.
const renameInJson = (glb, from, to) => {
  const json = glb.subarray(20, 20 + glb.readUInt32LE(12));
  for (let at = json.indexOf(from); at !== -1; at = json.indexOf(from, at)) json.write(to, at);
  return glb;
};

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const encoder = Object.assign(Object.create(MeshoptEncoder), {
  encodeGltfBuffer: (source, count, size, mode) =>
    MeshoptEncoder.encodeGltfBuffer(source, count, size, mode, mode === 'ATTRIBUTES' ? 1 : 0),
});
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': encoder,
});

const before = readFileSync(input);
const doc = await io.readBinary(renameInJson(Buffer.from(before), 'KHR_meshopt_compression', 'EXT_meshopt_compression'));
doc.createExtension(EXTMeshoptCompression).setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
const after = renameInJson(Buffer.from(await io.writeBinary(doc)), 'EXT_meshopt_compression', 'KHR_meshopt_compression');
writeFileSync(output, after);
console.log(`${output}: ${before.byteLength} → ${after.byteLength} bytes`);
