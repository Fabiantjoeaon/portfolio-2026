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

/**
 * Output size and filter graph (`[in]` → `[fit]`) for `source` within a `size`px
 * long edge. With `canvas` (an aspect), media wider than it is set full-width on a
 * canvas of that aspect, over a soft darkened blur of itself, so a narrower frame
 * that covers the canvas still shows most of the media.
 */
export const layout = (source, size, canvas) => {
  const fit = Math.min(1, size / Math.max(source.width, source.height));
  const width = even(source.width * fit);
  const height = even(source.height * fit);
  if (!canvas || source.width / source.height <= canvas * 1.05) {
    return { width, height, graph: `[in]scale=${width}:${height}:flags=lanczos,setsar=1[fit]` };
  }
  const canvasHeight = even(width / canvas);
  // Blurred at 1/8 size and scaled up bicubically, so it stays smooth.
  const [smallWidth, smallHeight] = [even(width / 8), even(canvasHeight / 8)];
  return {
    width,
    height: canvasHeight,
    graph: [
      '[in]split=2[fg][bg]',
      `[bg]scale=${smallWidth}:${smallHeight}:force_original_aspect_ratio=increase,crop=${smallWidth}:${smallHeight},` +
        `gblur=sigma=${Math.max(3, smallWidth / 28).toFixed(1)},eq=saturation=1.2,colorchannelmixer=rr=0.42:gg=0.42:bb=0.42,` +
        `scale=${width}:${canvasHeight}:flags=bicubic[back]`,
      `[fg]scale=${width}:${height}:flags=lanczos[front]`,
      `[back][front]overlay=0:${(canvasHeight - height) / 2},setsar=1[fit]`,
    ].join(';'),
  };
};

const videoGraph = (source, { size, fps: maxFps, start = 0, maxDuration, canvas }) => {
  const fps = Math.min(maxFps, Math.round(source.fps));
  const { width, height, graph: fitGraph } = layout(source, size, canvas);
  const available = Math.max(0, source.duration - start);
  const fade = available >= LOOP_FADE * 6 ? LOOP_FADE : 0;
  const length = Math.min(available, maxDuration + fade);
  const head = `[0:v]trim=${start}:${start + length},setpts=PTS-STARTPTS,fps=${fps}[in];${fitGraph};[fit]null`;
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
export const encodeStill = (file, target, source, { size, time = 0, quality = 82, canvas }) => {
  const { width, height, graph } = layout(source, size, canvas);
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', ...(time ? ['-ss', String(time)] : []), '-i', file,
    '-filter_complex', `[0:v]null[in];${graph};[fit]null[out]`, '-map', '[out]', '-frames:v', '1',
    '-c:v', 'libwebp', '-quality', String(quality), '-compression_level', '6', target,
  ], { stdio: 'inherit' });
  return { width, height };
};
