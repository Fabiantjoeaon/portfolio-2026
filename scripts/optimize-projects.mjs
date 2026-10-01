// Drop project media into assets-src/projects/<Folder> (set as `media.folder`
// in src/content/projects/<slug>.js) and run `npm run media:projects`.
// Writes to public/assets/media/<slug>:
//   <name>.webp / <name>.mobile.webp                 images (2560px / 1080px)
//   <name>.mp4 / <name>.mobile.mp4                   videos (1920px 60fps / 960px 30fps, ≤30s loop)
//   <name>.poster.webp / <name>.poster.mobile.webp   first frame of each video
//   thumb.mp4 / thumb.mobile.mp4                     10s home loop
// Media whose aspect differs from the frame (16:9 desktop, 3:4 mobile) is
// fitted inside it over a blurred copy. Also writes src/shared/projectMedia.json.
//   --force            re-encode even when outputs are newer than the source
//   --only <desktop|mobile>  only write that rendition
//   --project <slug>   only process one project
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import CONTENT from '../src/content/projects/index.js';
import { IMAGE_EXTENSIONS, LOOP_FADE, VIDEO_EXTENSIONS, encodeStill, encodeVideo, isFresh, layout, probe } from './lib/media.mjs';

const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};
const force = args.includes('--force');
const only = option('--only');
const onlyProject = option('--project');
const input = 'assets-src/projects';
const output = 'public/assets/media';
const manifestPath = 'src/shared/projectMedia.json';

const GALLERY_DURATION = 30;
const THUMB_DURATION = 10;
const DETAILS = 2;
const DESKTOP = { suffix: '', frame: 16 / 9, image: 2560, video: { size: 1920, fps: 60, crf: 21, maxrate: '6M', bufsize: '12M' } };
const MOBILE = { suffix: '.mobile', frame: 3 / 4, image: 1080, video: { size: 960, fps: 30, crf: 24, maxrate: '2M', bufsize: '4M' } };
const RENDITIONS = [DESKTOP, MOBILE].filter(rendition => !only || (only === 'mobile') === (rendition === MOBILE));
const slugify = name => name.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const hash = path => new Promise((resolve, reject) => {
  const digest = createHash('sha1');
  createReadStream(path).on('data', chunk => digest.update(chunk)).on('end', () => resolve(digest.digest('hex'))).on('error', reject);
});

async function collect(folder, exclude = []) {
  // Shortest name first, so a duplicate keeps the original rather than "name kopie".
  const files = readdirSync(folder).filter(file => !file.startsWith('.') && !exclude.includes(file))
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
  const seen = new Map();
  const items = [];
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    const type = VIDEO_EXTENSIONS.has(ext) ? 'video' : IMAGE_EXTENSIONS.has(ext) ? 'image' : null;
    if (!type) continue;
    const path = join(folder, file);
    const key = `${statSync(path).size}:${await hash(path)}`;
    if (seen.has(key)) {
      console.log(`  skip ${file} (duplicate of ${seen.get(key)})`);
      continue;
    }
    seen.set(key, file);
    items.push({ file, path, type, name: slugify(basename(file, extname(file))), source: probe(path) });
  }
  return items;
}

const pickThumbnail = (items, config, folder) => {
  if (config.thumbnail) {
    const { file, start = 0 } = config.thumbnail;
    const path = join(folder, file);
    const item = items.find(entry => entry.file === file)
      ?? (existsSync(path) && { file, path, type: 'video', external: true, source: probe(path) });
    if (!item) throw new Error(`thumbnail ${file} not found`);
    return { item, start };
  }
  const videos = items.filter(entry => entry.type === 'video' && entry.source.width >= entry.source.height);
  const item = videos.sort((a, b) => b.source.duration - a.source.duration)[0];
  if (!item) return null;
  return { item, start: Math.round(item.source.duration * 0.1 * 10) / 10 };
};

const sortItems = (items, config, thumbnail) => {
  const listed = (config.order ?? []).map(file => items.find(item => item.file === file)).filter(Boolean);
  const rest = items.filter(item => !listed.includes(item));
  const rank = item => item === thumbnail?.item ? 0 : item.type === 'video' ? 1 : 2;
  const sorted = [...listed, ...rest.sort((a, b) => rank(a) - rank(b) || a.file.localeCompare(b.file))];
  // The opening slide is never a blur-padded asset.
  const padded = item => layout(item.source, DESKTOP.image, DESKTOP.frame).pad;
  const first = sorted.find(item => !padded(item));
  if (first && first !== sorted[0]) {
    if (listed[0]) console.warn(`  ! ${listed[0].file} is blur-padded; opening with ${first.file} instead`);
    sorted.splice(sorted.indexOf(first), 1);
    sorted.unshift(first);
  }
  return sorted;
};

const pickDetails = (items, config) => {
  if (config.details?.length) return config.details.map(file => items.findIndex(item => item.file === file)).filter(index => index > 0);
  const rest = items.map((item, index) => ({ item, index })).slice(1);
  const videos = rest.filter(({ item }) => item.type === 'video');
  const images = rest.filter(({ item }) => item.type === 'image');
  return [...videos.slice(0, 1), ...images, ...videos.slice(1)].slice(0, DETAILS)
    .map(({ index }) => index).sort((a, b) => a - b);
};

const run = (label, targets, path, fresh, encode) => {
  if (!force && fresh && isFresh(targets, path)) return false;
  encode();
  const kb = targets.map(target => `${Math.round(statSync(target).size / 1024)} KB`).join(' + ');
  console.log(`  ✓ ${label} ${kb}`);
  return true;
};

async function processProject(slug, config, previous) {
  const folder = join(input, config.folder);
  if (!existsSync(folder)) {
    console.warn(`! ${slug}: no folder ${folder}`);
    return null;
  }
  console.log(`${slug} ← ${config.folder}`);
  const dir = join(output, slug);
  mkdirSync(dir, { recursive: true });
  const all = await collect(folder, config.exclude);
  const thumbnail = pickThumbnail(all, config, folder);
  const items = sortItems(all, config, thumbnail);
  const written = new Set();
  const publicPath = file => `assets/media/${slug}/${file}`;
  const media = [];

  for (const item of items) {
    const video = item.type === 'video';
    const isThumbSource = item === thumbnail?.item;
    const start = isThumbSource ? thumbnail.start : 0;
    const src = publicPath(`${item.name}${video ? '.mp4' : '.webp'}`);
    const before = previous?.media?.find(entry => entry.src === src);
    const fresh = Boolean(before) && (!video || before.start === start);
    // The loop crossfade drops the first LOOP_FADE seconds from the output.
    const firstFrame = item.source.duration - start >= LOOP_FADE * 6 ? start + LOOP_FADE : start;
    for (const rendition of RENDITIONS) {
      const label = `${item.file} ${rendition.suffix ? 'mobile' : 'desktop'}`;
      if (!video) {
        const target = join(dir, `${item.name}${rendition.suffix}.webp`);
        written.add(target);
        run(label, [target], item.path, fresh, () =>
          encodeStill(item.path, target, item.source, { size: rendition.image, frame: rendition.frame }));
        continue;
      }
      const target = join(dir, `${item.name}${rendition.suffix}.mp4`);
      const poster = join(dir, `${item.name}.poster${rendition.suffix}.webp`);
      written.add(target).add(poster);
      run(label, [target, poster], item.path, fresh, () => {
        encodeVideo(item.path, target, item.source, rendition.video, { start, maxDuration: GALLERY_DURATION, frame: rendition.frame });
        encodeStill(item.path, poster, item.source, { size: rendition.video.size, frame: rendition.frame, time: firstFrame });
      });
    }
    const [desktop, mobile] = [DESKTOP, MOBILE].map(rendition =>
      layout(item.source, video ? rendition.video.size : rendition.image, rendition.frame));
    media.push({
      type: item.type,
      file: item.file,
      src,
      ...(item.type === 'video' && { poster: publicPath(`${item.name}.poster.webp`), start }),
      width: desktop.width,
      height: desktop.height,
      mobile: { width: mobile.width, height: mobile.height },
      ...(isThumbSource && { thumbSource: true }),
    });
  }

  let thumb = null;
  if (thumbnail) {
    thumb = publicPath('thumb.mp4');
    const fresh = previous?.thumbStart === thumbnail.start && previous?.thumbFile === thumbnail.item.file;
    for (const rendition of RENDITIONS) {
      const target = join(dir, `thumb${rendition.suffix}.mp4`);
      written.add(target);
      run(`thumb ${rendition.suffix ? 'mobile' : 'desktop'} (${thumbnail.item.file} @ ${thumbnail.start}s)`, [target], thumbnail.item.path, fresh, () =>
        encodeVideo(thumbnail.item.path, target, thumbnail.item.source, rendition.video, { start: thumbnail.start, maxDuration: THUMB_DURATION }));
    }
  }

  if (!only) {
    for (const file of readdirSync(dir)) {
      if (!written.has(join(dir, file))) rmSync(join(dir, file));
    }
  }
  return { thumb, thumbFile: thumbnail?.item.file, thumbStart: thumbnail?.start, details: pickDetails(items, config), media };
}

const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
for (const { slug, media } of CONTENT) {
  if (onlyProject && slug !== onlyProject) continue;
  const entry = await processProject(slug, media, manifest[slug]);
  if (entry) manifest[slug] = entry;
}
const slugs = new Set(CONTENT.map(project => project.slug));
for (const slug of Object.keys(manifest)) if (!slugs.has(slug)) delete manifest[slug];
const sorted = Object.fromEntries(Object.keys(manifest).sort().map(slug => [slug, manifest[slug]]));
writeFileSync(manifestPath, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`Wrote ${manifestPath} (${Object.keys(sorted).length} projects)`);
