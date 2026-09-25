// Temporary gallery stills from the supplied portfolio reels. Replace via project.media.
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
for (const name of ['monolith', 'iconic_mints', 'savoir_faire', 'made_to_be_found', 'spotify_top_5']) {
  const source = `public/assets/video/${name}.mp4`;
  const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', source], { encoding: 'utf8' }).trim());
  const folder = `public/assets/projects/${name}`;
  mkdirSync(folder, { recursive: true });
  for (const [i, fraction] of [0.22, 0.5, 0.78].entries()) {
    const target = `${folder}/${i + 1}.webp`;
    if (existsSync(target)) continue;
    execFileSync('ffmpeg', ['-v', 'error', '-ss', String(duration * fraction), '-i', source, '-frames:v', '1', '-vf', 'scale=1280:-2', '-quality', '82', '-n', target]);
  }
  console.log(`Prepared ${name}`);
}
