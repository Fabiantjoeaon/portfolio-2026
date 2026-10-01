import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';

// The clip's tail crossfades into its head, so the loop point has no cut.
export const LOOP_FADE = 0.5;
export const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv']);
export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff']);

export const probe = file => {
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
    duration: Number(json.format.duration) || 0,
  };
};

export const isFresh = (targets, source) => targets.every(target =>
  existsSync(target) && statSync(target).mtimeMs > statSync(source).mtimeMs);

const even = value => Math.max(2, Math.round(value / 2) * 2);

/** Output size and scale filter for `source` within a `size`px long edge. */
export const layout = (source, size) => {
  const fit = Math.min(1, size / Math.max(source.width, source.height));
  const width = even(source.width * fit);
  const height = even(source.height * fit);
  return { width, height, filter: `scale=${width}:${height}:flags=lanczos,setsar=1` };
};

const videoGraph = (source, { size, fps: maxFps, start = 0, maxDuration }) => {
  const fps = Math.min(maxFps, Math.round(source.fps));
  const { width, height, filter } = layout(source, size);
  const available = Math.max(0, source.duration - start);
  const fade = available >= LOOP_FADE * 6 ? LOOP_FADE : 0;
  const length = Math.min(available, maxDuration + fade);
  const head = `[0:v]trim=${start}:${start + length},setpts=PTS-STARTPTS,fps=${fps},${filter}`;
  if (!fade) return { graph: `${head},format=yuv420p[out]`, duration: length, fps, width, height };
  return {
    graph: [
      `${head},split[a][b]`,
      `[a]trim=${fade}:${length},setpts=PTS-STARTPTS,fps=${fps}[body]`,
      `[b]trim=0:${fade},setpts=PTS-STARTPTS,fps=${fps}[tail]`,
      `[body][tail]xfade=transition=fade:duration=${fade}:offset=${length - 2 * fade},format=yuv420p[out]`,
    ].join(';'),
    duration: length - fade,
    fps,
    width,
    height,
  };
};

/** Encodes a seamless H.264 loop; `rendition` = { size, fps, crf, maxrate, bufsize }. */
export const encodeVideo = (file, target, source, rendition, options = {}) => {
  const { graph, duration, fps, width, height } = videoGraph(source, { ...rendition, ...options });
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-i', file,
    '-filter_complex', graph, '-map', '[out]', '-an',
    '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-crf', String(rendition.crf), '-maxrate', rendition.maxrate, '-bufsize', rendition.bufsize,
    '-g', String(fps * 2),
    '-movflags', '+faststart', target,
  ], { stdio: 'inherit' });
  return { duration, width, height };
};

/** Writes a WebP still: an image, or the frame at `time` of a video. */
export const encodeStill = (file, target, source, { size, time = 0, quality = 82 }) => {
  const { width, height, filter } = layout(source, size);
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', ...(time ? ['-ss', String(time)] : []), '-i', file,
    '-filter_complex', `[0:v]${filter}[out]`, '-map', '[out]', '-frames:v', '1',
    '-c:v', 'libwebp', '-quality', String(quality), '-compression_level', '6', target,
  ], { stdio: 'inherit' });
  return { width, height };
};
