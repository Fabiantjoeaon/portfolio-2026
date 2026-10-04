// Drop source reels into originals/video and run `npm run video:optimize`.
// Writes a desktop and a touch rendition per reel to public/assets/video,
// trimmed to a seamless loop, plus src/shared/videos.json for the runtime.
//   --force        re-encode even when outputs are newer than the source
//   --in <dir>     source folder (default originals/video)
//   --out <dir>    output folder (default public/assets/video)
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { VIDEO_EXTENSIONS, encodeVideo, isFresh, probe } from './lib/media.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const force = args.includes('--force');
const input = option('--in', 'originals/video');
const output = option('--out', 'public/assets/video');
const manifestPath = 'src/shared/videos.json';

const MAX_DURATION = 10;
const RENDITIONS = [
  { suffix: '', size: 1920, fps: 60, crf: 21, maxrate: 6000 },
  { suffix: '.mobile', size: 960, fps: 30, crf: 24, maxrate: 2000 },
];

if (!existsSync(input)) {
  console.error(`No source folder at ${input}`);
  process.exit(1);
}
mkdirSync(output, { recursive: true });
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const sources = readdirSync(input).filter(file => VIDEO_EXTENSIONS.has(extname(file).toLowerCase())).sort();
const names = new Set();

for (const file of sources) {
  const name = basename(file, extname(file));
  const path = join(input, file);
  names.add(name);
  const targets = RENDITIONS.map(rendition => join(output, `${name}${rendition.suffix}.mp4`));
  if (isFresh(targets, path) && !force && manifest[name]) {
    console.log(`= ${name} (up to date)`);
    continue;
  }

  const source = probe(path);
  const entry = {};
  RENDITIONS.forEach((rendition, index) => {
    const { duration, width, height } = encodeVideo(path, targets[index], source, rendition, { maxDuration: MAX_DURATION });
    entry[rendition.suffix ? 'mobile' : 'desktop'] = { width, height, bytes: statSync(targets[index]).size };
    entry.duration = Math.round(duration * 100) / 100;
  });
  manifest[name] = entry;
  const kb = key => `${Math.round(entry[key].bytes / 1024)} KB`;
  console.log(`✓ ${name}: ${source.width}×${source.height} ${Math.round(source.fps)}fps ${source.duration.toFixed(1)}s → ${entry.duration}s, desktop ${kb('desktop')}, mobile ${kb('mobile')}`);
}

for (const name of Object.keys(manifest)) if (!names.has(name)) delete manifest[name];
const sorted = Object.fromEntries(Object.keys(manifest).sort().map(name => [name, manifest[name]]));
writeFileSync(manifestPath, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`Wrote ${manifestPath} (${Object.keys(sorted).length} videos)`);
