// Drop source reels into assets-src/video and run `npm run video:optimize`.
// Writes a desktop and a touch rendition per reel to public/assets/video,
// trimmed to a seamless loop, plus src/shared/videos.json for the runtime.
//   --force        re-encode even when outputs are newer than the source
//   --in <dir>     source folder (default assets-src/video)
//   --out <dir>    output folder (default public/assets/video)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const force = args.includes('--force');
const input = option('--in', 'assets-src/video');
const output = option('--out', 'public/assets/video');
const manifestPath = 'src/shared/videos.json';

const MAX_DURATION = 10;
// The clip's tail crossfades into its head, so the loop point has no cut.
const LOOP_FADE = 0.5;
const EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv']);
const RENDITIONS = [
  { suffix: '', size: 1920, fps: 60, crf: 21, maxrate: '6M', bufsize: '12M' },
  { suffix: '.mobile', size: 960, fps: 30, crf: 24, maxrate: '2M', bufsize: '4M' },
];

const probe = file => {
  const json = JSON.parse(execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate:format=duration',
    '-of', 'json', file,
  ], { encoding: 'utf8' }));
  const stream = json.streams[0];
  const [numerator, denominator] = stream.r_frame_rate.split('/').map(Number);
  return {
    width: stream.width,
    height: stream.height,
    fps: numerator / (denominator || 1),
    duration: Number(json.format.duration),
  };
};

const filterGraph = (source, rendition) => {
  const fps = Math.min(rendition.fps, Math.round(source.fps));
  const fit = Math.min(1, rendition.size / Math.max(source.width, source.height));
  const width = Math.round(source.width * fit / 2) * 2;
  const height = Math.round(source.height * fit / 2) * 2;
  const scale = `fps=${fps},scale=${width}:${height}:flags=lanczos,setsar=1`;
  const fade = source.duration >= LOOP_FADE * 6 ? LOOP_FADE : 0;
  const length = Math.min(source.duration, MAX_DURATION + fade);
  if (!fade) return { graph: `[0:v]trim=0:${length},setpts=PTS-STARTPTS,${scale}[out]`, duration: length };
  return {
    graph: [
      `[0:v]trim=0:${length},setpts=PTS-STARTPTS,${scale},split[a][b]`,
      `[a]trim=${fade}:${length},setpts=PTS-STARTPTS,fps=${fps}[body]`,
      `[b]trim=0:${fade},setpts=PTS-STARTPTS,fps=${fps}[head]`,
      `[body][head]xfade=transition=fade:duration=${fade}:offset=${length - 2 * fade},format=yuv420p[out]`,
    ].join(';'),
    duration: length - fade,
  };
};

const encode = (file, target, source, rendition) => {
  const { graph, duration } = filterGraph(source, rendition);
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-i', file,
    '-filter_complex', graph, '-map', '[out]', '-an',
    '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-crf', String(rendition.crf), '-maxrate', rendition.maxrate, '-bufsize', rendition.bufsize,
    '-g', String(Math.round(Math.min(rendition.fps, source.fps) * 2)),
    '-movflags', '+faststart', target,
  ], { stdio: 'inherit' });
  return duration;
};

if (!existsSync(input)) {
  console.error(`No source folder at ${input}`);
  process.exit(1);
}
mkdirSync(output, { recursive: true });
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const sources = readdirSync(input).filter(file => EXTENSIONS.has(extname(file).toLowerCase())).sort();
const names = new Set();

for (const file of sources) {
  const name = basename(file, extname(file));
  const path = join(input, file);
  names.add(name);
  const targets = RENDITIONS.map(rendition => join(output, `${name}${rendition.suffix}.mp4`));
  const fresh = targets.every(target => existsSync(target) && statSync(target).mtimeMs > statSync(path).mtimeMs);
  if (fresh && !force && manifest[name]) {
    console.log(`= ${name} (up to date)`);
    continue;
  }

  const source = probe(path);
  const entry = {};
  RENDITIONS.forEach((rendition, index) => {
    const duration = encode(path, targets[index], source, rendition);
    const result = probe(targets[index]);
    entry[rendition.suffix ? 'mobile' : 'desktop'] = {
      width: result.width,
      height: result.height,
      bytes: statSync(targets[index]).size,
    };
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
