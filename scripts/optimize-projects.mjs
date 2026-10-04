// Original project media lives in originals/projects/<slug> and stays there.
// `npm run media:projects` encodes it into public/assets/media/<slug>:
//   <name>.webp / <name>.mobile.webp                 images (2560px / 1080px)
//   <name>.mp4 / <name>.mobile.mp4                   videos (1920px 60fps / 960px 30fps, ≤30s loop)
//   <name>.hevc.mp4 / <name>.mobile.hevc.mp4         HEVC copy of each video
//   <name>.poster.webp / <name>.poster.mobile.webp   first frame of each video
//   <still>.blur<sigma>.webp                         gallery backdrop of each still/poster
//   thumb.home.mp4 / thumb.home.mobile.mp4           10s home loop, only when the thumbnail's
//                                                    film is longer; otherwise home plays the film
// The project file (src/content/projects/<slug>.js) refers to originals by file
// name; the site picks the desktop or mobile rendition itself. Desktop media keeps
// its own aspect and the gallery crops it to the frame. Originals dropped into
// public/assets/media/<slug> by mistake are moved into originals/projects/<slug>.
// Also writes src/shared/projectMedia.json.
//   --force                  re-encode even when outputs are newer than the source
//   --only <desktop|mobile>  only write that rendition
//   --project <slug>         only process one project
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import CONTENT, { mediaKey } from '../src/content/projects/index.js';
import { BLUR_FILE, blurPath } from '../src/shared/bakedTextures.js';
import { IMAGE_EXTENSIONS, LOOP_FADE, VIDEO_EXTENSIONS, VIDEO_WIDTH_STEP, encodeBlur, encodeStill, encodeVideo, hevcPath, isFresh, layout, probe } from './lib/media.mjs';

const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};
const force = args.includes('--force');
const only = option('--only');
const onlyProject = option('--project');
const input = 'originals/projects';
const output = 'public/assets/media';
const manifestPath = 'src/shared/projectMedia.json';

// Read from source: params.js only resolves inside Vite.
const BLUR_SIGMA = Number(readFileSync('src/offscreen/params.js', 'utf8').match(/galleryBlurRadius:\s*\{\s*value:\s*([\d.]+)/)[1]);
const GALLERY_DURATION = 30;
const THUMB_DURATION = 10;
const DETAILS = 2;
const DESKTOP = { suffix: '', image: 2560, video: { size: 1920, fps: 60, crf: 21, maxrate: 6000 } };
// Mobile frames are 3:4. Landscape gallery media is set on a square canvas over a
// blur of itself, so covering the frame shows ~75% of its width instead of ~42%.
// Page-only details skip that canvas; their frame is filled in the still shader.
const MOBILE = { suffix: '.mobile', image: 1080, canvas: 1, video: { size: 960, fps: 30, crf: 24, maxrate: 2000 } };
const RENDITIONS = [DESKTOP, MOBILE].filter(rendition => !only || (only === 'mobile') === (rendition === MOBILE));

const hash = path => new Promise((resolve, reject) => {
  const digest = createHash('sha1');
  createReadStream(path).on('data', chunk => digest.update(chunk)).on('end', () => resolve(digest.digest('hex'))).on('error', reject);
});

async function collect(folder, exclude = []) {
  // Shortest name first, so a duplicate keeps the original rather than "name kopie".
  const skip = new Set(exclude.map(mediaKey));
  const files = readdirSync(folder).filter(file => !file.startsWith('.') && !skip.has(mediaKey(file)))
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
    items.push({ file, path, type, name: mediaKey(file), source: probe(path) });
  }
  return items;
}

const find = (items, file) => items.find(item => item.name === mediaKey(file));

function checkReferences(slug, items, config) {
  const names = [...config.order ?? [], ...config.details ?? [], ...Object.keys(config.alt ?? {})];
  if (config.thumbnail?.file) names.push(config.thumbnail.file);
  for (const file of names) {
    if (!find(items, file)) console.warn(`  ! ${slug}: "${file}" is not in ${join(input, slug)}`);
  }
}

const pickThumbnail = (items, config) => {
  if (config.thumbnail?.file) {
    const item = find(items, config.thumbnail.file);
    if (item) return { item, start: config.thumbnail.start ?? 0 };
  }
  const videos = items.filter(entry => entry.type === 'video' && entry.source.width >= entry.source.height);
  const item = videos.sort((a, b) => b.source.duration - a.source.duration)[0];
  if (!item) return null;
  return { item, start: Math.round(item.source.duration * 0.1 * 10) / 10 };
};

// Details that aren't gallery slides go last, so the slides stay one run.
const sortItems = (items, config, thumbnail, details) => {
  const listed = (config.order ?? []).map(file => find(items, file)).filter(Boolean);
  const pageOnly = details.filter(item => !listed.includes(item));
  const rest = items.filter(item => !listed.includes(item) && !pageOnly.includes(item));
  const rank = item => item === thumbnail?.item ? 0 : item.type === 'video' ? 1 : 2;
  return [...listed, ...rest.sort((a, b) => rank(a) - rank(b) || a.file.localeCompare(b.file)), ...pageOnly];
};

const pickDetails = (items, config) => [...new Set((config.details ?? []).map(file => find(items, file)).filter(Boolean))].slice(0, DETAILS);

const run = (label, targets, path, fresh, encode) => {
  if (!force && fresh && isFresh(targets, path)) return false;
  encode();
  const kb = targets.map(target => `${Math.round(statSync(target).size / 1024)} KB`).join(' + ');
  console.log(`  ✓ ${label} ${kb}`);
  return true;
};

const bakeBlur = (label, still, written) => {
  const target = blurPath(still, BLUR_SIGMA);
  written.add(target);
  run(`${label} blur`, [target], still, true, () => encodeBlur(still, target, BLUR_SIGMA));
};

const mobilePath = path => path.replace(/(\.\w+)$/, '.mobile$1');

function rescueOriginals(slug, dir, folder, previous) {
  if (!existsSync(dir)) return;
  const outputs = new Set();
  const add = path => outputs.add(path).add(mobilePath(path)).add(hevcPath(path)).add(hevcPath(mobilePath(path)));
  for (const entry of previous?.media ?? []) {
    for (const path of [entry.src, entry.poster].filter(Boolean)) add(path);
  }
  if (previous?.thumb) add(previous.thumb);
  const now = new Date();
  for (const file of readdirSync(dir)) {
    const ext = extname(file).toLowerCase();
    if (file.startsWith('.') || BLUR_FILE.test(file) || outputs.has(`assets/media/${slug}/${file}`)) continue;
    if (!VIDEO_EXTENSIONS.has(ext) && !IMAGE_EXTENSIONS.has(ext)) continue;
    mkdirSync(folder, { recursive: true });
    const target = join(folder, file);
    renameSync(join(dir, file), target);
    utimesSync(target, now, now);
    console.log(`  + ${file} → ${folder}`);
  }
}

async function processProject(slug, config, previous) {
  const folder = join(input, slug);
  const dir = join(output, slug);
  console.log(slug);
  rescueOriginals(slug, dir, folder, previous);
  if (!existsSync(folder)) {
    console.warn(`! ${slug}: no originals in ${folder}`);
    return null;
  }
  mkdirSync(dir, { recursive: true });
  const all = await collect(folder, config.exclude);
  checkReferences(slug, all, config);
  const thumbnail = pickThumbnail(all, config);
  const detailItems = pickDetails(all, config);
  const items = sortItems(all, config, thumbnail, detailItems);
  const details = detailItems.map(item => items.indexOf(item));
  const slides = new Set((config.order ?? []).map(file => find(items, file)));
  const written = new Set();
  const publicPath = file => `assets/media/${slug}/${file}`;
  const media = [];
  let thumbSized = true;

  for (const item of items) {
    const video = item.type === 'video';
    const start = item === thumbnail?.item ? thumbnail.start : 0;
    const src = publicPath(`${item.name}${video ? '.mp4' : '.webp'}`);
    const before = previous?.media?.find(entry => entry.src === src);
    // Page-only details keep their own aspect; the still shader fills the frame with the blur.
    const pageOnly = detailItems.includes(item) && !slides.has(item);
    const canvasOf = rendition => item === thumbnail?.item || pageOnly ? undefined : rendition.canvas;
    const widthStep = video ? VIDEO_WIDTH_STEP : undefined;
    const [desktop, mobile] = [DESKTOP, MOBILE].map(rendition =>
      layout(item.source, video ? rendition.video.size : rendition.image, canvasOf(rendition), widthStep));
    const sameSize = before?.width === desktop.width && before?.height === desktop.height
      && before?.mobile?.width === mobile.width && before?.mobile?.height === mobile.height;
    if (item === thumbnail?.item) thumbSized = sameSize;
    const fresh = sameSize && (!video || before.start === start);
    // The loop crossfade drops the first LOOP_FADE seconds from the output.
    const firstFrame = item.source.duration - start >= LOOP_FADE * 6 ? start + LOOP_FADE : start;
    for (const rendition of RENDITIONS) {
      const label = `${item.file} ${rendition.suffix ? 'mobile' : 'desktop'}`;
      const canvas = canvasOf(rendition);
      if (!video) {
        const target = join(dir, `${item.name}${rendition.suffix}.webp`);
        written.add(target);
        run(label, [target], item.path, fresh, () =>
          encodeStill(item.path, target, item.source, { size: rendition.image, canvas }));
        bakeBlur(label, target, written);
        continue;
      }
      const target = join(dir, `${item.name}${rendition.suffix}.mp4`);
      const poster = join(dir, `${item.name}.poster${rendition.suffix}.webp`);
      written.add(target).add(hevcPath(target)).add(poster);
      run(label, [target, hevcPath(target), poster], item.path, fresh, () => {
        encodeVideo(item.path, target, item.source, { ...rendition.video, canvas }, { start, maxDuration: GALLERY_DURATION });
        encodeStill(item.path, poster, item.source, { size: rendition.video.size, time: firstFrame, canvas, widthStep });
      });
      bakeBlur(label, poster, written);
    }
    media.push({
      type: item.type,
      file: item.file,
      src,
      ...(video && { poster: publicPath(`${item.name}.poster.webp`), start }),
      width: desktop.width,
      height: desktop.height,
      mobile: { width: mobile.width, height: mobile.height },
      ...(item === thumbnail?.item && { thumbSource: true }),
      ...(detailItems.includes(item) && !slides.has(item) && { slide: false }),
    });
  }

  let thumb = null;
  // A film no longer than the home loop encodes to the same file, and sharing its
  // URL lets the playing thumbnail carry straight on into the gallery.
  const ownLoop = thumbnail && thumbnail.item.source.duration - thumbnail.start > THUMB_DURATION + LOOP_FADE;
  if (thumbnail && !ownLoop) thumb = publicPath(`${thumbnail.item.name}.mp4`);
  if (ownLoop) {
    // Media names never contain a dot, so this can't collide with a source named "thumb".
    thumb = publicPath('thumb.home.mp4');
    const fresh = thumbSized && previous?.thumb === thumb && previous?.thumbStart === thumbnail.start && previous?.thumbFile === thumbnail.item.file;
    for (const rendition of RENDITIONS) {
      const target = join(dir, `thumb.home${rendition.suffix}.mp4`);
      written.add(target).add(hevcPath(target));
      run(`thumb ${rendition.suffix ? 'mobile' : 'desktop'} (${thumbnail.item.file} @ ${thumbnail.start}s)`, [target, hevcPath(target)], thumbnail.item.path, fresh, () =>
        encodeVideo(thumbnail.item.path, target, thumbnail.item.source, rendition.video, { start: thumbnail.start, maxDuration: THUMB_DURATION }));
    }
  }

  if (!only) {
    for (const file of readdirSync(dir)) {
      if (!written.has(join(dir, file))) rmSync(join(dir, file));
    }
  }
  console.log(`  gallery: ${items.filter(item => !detailItems.includes(item) || slides.has(item)).map(item => item.file).join(', ') || '—'}`);
  console.log(`  details: ${detailItems.map(item => item.file).join(' / ') || '—'}`);
  return { thumb, thumbFile: thumbnail?.item.file, thumbStart: thumbnail?.start, details, media };
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
