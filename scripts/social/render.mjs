// Renders the assets in social.config.js into a new run folder, <output.dir>/<date>_<time>:
//   npm run media:social [-- --only reel-main,still-duo] [--preview] [--list]
//   --only <names>   comma separated asset names (an `each` asset renders all its files)
//   --preview        half size, fast encode, no covers; the run folder ends in -preview
//   --list           print the resolved assets and exit
//   --config <path>  another config file (default social.config.js)
// Each run keeps a copy of the config it was rendered with. Sources are only read;
// every file is written as <name>.tmp.<ext>, then renamed.
import { copyFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveConfig } from './config.mjs';
import { render } from './ffmpeg.mjs';

const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};
const preview = args.includes('--preview');
const only = option('--only')?.split(',').map(name => name.trim()).filter(Boolean);

const configPath = resolve(option('--config') ?? 'social.config.js');
const { default: config } = await import(pathToFileURL(configPath).href);
const { jobs, outDir, sourceDirs, sourceFiles } = resolveConfig(config);

const within = (path, dir) => {
  const rel = relative(dir, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};
const display = path => (within(path, process.cwd()) ? relative('.', path) : path);
for (const dir of sourceDirs) {
  if (within(outDir, dir) || within(dir, outDir)) {
    throw new Error(`output.dir (${relative('.', outDir)}) must not overlap the source folder ${relative('.', dir)}`);
  }
}
const protectedFiles = new Set(sourceFiles);

const selected = jobs.filter(job => !only || only.some(name => job.name === name || job.name.startsWith(`${name}/`)));
if (only && !selected.length) {
  console.error(`No assets match ${only.join(', ')} (have: ${[...new Set(jobs.map(job => job.name.split('/')[0]))].join(', ')})`);
  process.exit(1);
}

if (args.includes('--list')) {
  for (const job of selected) {
    const content = job.pool
      ? `${job.pool.length} sources`
      : job.slots.map(slot => slot.clips.map(clip => clip.source.name).join(' > ')).join(' | ');
    console.log(`${job.name.padEnd(32)} ${job.template.padEnd(8)} ${job.kind.padEnd(6)} ${content}  →  ${relative(outDir, job.out)}`);
  }
  process.exit(0);
}

const pad = value => String(value).padStart(2, '0');
const now = new Date();
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
const runDir = join(outDir, preview ? `${stamp}-preview` : stamp);
const cache = join(outDir, '.cache');
mkdirSync(cache, { recursive: true });
mkdirSync(runDir, { recursive: true });
copyFileSync(configPath, join(runDir, basename(configPath)));
console.log(`Run → ${display(runDir)}`);

const tmpPath = path => path.replace(/(\.\w+)$/, '.tmp$1');
const megabytes = path => `${(statSync(path).size / 1024 / 1024).toFixed(1)} MB`;
let failed = 0;

for (const job of selected) {
  const target = join(runDir, relative(outDir, job.out));
  const coverTarget = preview || !job.cover ? null : join(runDir, relative(outDir, job.cover));
  for (const path of [target, coverTarget].filter(Boolean)) {
    if (protectedFiles.has(path) || !within(path, runDir)) throw new Error(`${job.name}: refusing to write ${path}`);
  }

  mkdirSync(dirname(target), { recursive: true });
  const temporary = [tmpPath(target), coverTarget && tmpPath(coverTarget)];
  const started = performance.now();
  console.log(`→ ${job.name} (${job.template}, ${job.kind})`);
  try {
    const { frames, glitches = [] } = await render(job, { cache, preview, target: temporary[0], coverTarget: temporary[1] });
    renameSync(temporary[0], target);
    if (coverTarget) renameSync(temporary[1], coverTarget);
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    const length = job.kind === 'video' ? ` ${(frames / job.output.fps).toFixed(2)}s,` : '';
    console.log(`✓ ${display(target)}:${length} ${megabytes(target)} in ${seconds}s`);
    if (glitches.length) console.log(`  glitches: ${glitches.map(({ style, time }) => `${style} @ ${time.toFixed(2)}s`).join(', ')}`);
  } catch (error) {
    for (const path of temporary.filter(Boolean)) rmSync(path, { force: true });
    console.error(`✗ ${job.name}: ${error.message}`);
    failed++;
  }
}

if (failed) process.exit(1);
