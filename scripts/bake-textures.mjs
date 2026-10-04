// Bakes textures the runtime would otherwise generate on every load: the
// fractal noise for Ice and Meadow, and the glyph glow atlases for the About
// wall and the Cube particles. Uses the runtime's own generators, so the files
// match what the browser would build. Run `npm run textures:bake` after
// changing FBM_NOISE, PARTICLE_GLYPHS or the mono font (`fonts:msdf` runs it).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { parseMSDFFont } from 'three-blocks/msdf-text';
import { encodePlanes } from '../src/shared/bakedPlanes.js';
import { FBM_NOISE, fbmNoisePath, glyphGlowPath, PARTICLE_GLYPHS } from '../src/shared/bakedTextures.js';
import { FONTS } from '../src/shared/fonts.js';
import { fbmNoiseData } from '../src/offscreen/utils/NoiseTexture3D.js';
import { layoutGlyphCoverage, rasterGlyphCoverage } from '../src/offscreen/utils/glyphCoverageAtlas.js';

const write = (path, planes) => {
  const out = join('public', path);
  const bytes = gzipSync(planes, { level: 9 });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);
  console.log(`✓ ${out} (${bytes.length} bytes)`);
};

for (const spec of Object.values(FBM_NOISE)) {
  const { size, octaves, persistence } = spec;
  write(fbmNoisePath(spec), encodePlanes(fbmNoiseData(size, octaves, persistence), size, size, 3, 4));
}

const atlasPath = join('public', `${FONTS.mono.atlas.msdf}.png`);
const font = parseMSDFFont(JSON.parse(readFileSync(join('public', `${FONTS.mono.atlas.msdf}.json`), 'utf8')), { flipY: true });
const pixels = execFileSync('ffmpeg', ['-v', 'error', '-i', atlasPath, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 64 << 20 });
if (pixels.length !== font.atlasWidth * font.atlasHeight * 4) throw new Error(`${atlasPath}: unexpected size`);
// Canvas readback (the runtime path) returns black wherever alpha is 0.
for (let i = 0; i < pixels.length; i += 4) if (!pixels[i + 3]) pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;

const glyphSets = {
  all: [...font.glyphs.values()],
  particles: Array.from(PARTICLE_GLYPHS, char => font.getGlyph(char.codePointAt(0))),
};
for (const [set, glyphs] of Object.entries(glyphSets)) {
  const layout = layoutGlyphCoverage(font, glyphs);
  write(glyphGlowPath(set), encodePlanes(rasterGlyphCoverage(layout, pixels, font), layout.width, layout.height, 4));
}
