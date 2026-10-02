// Generates the MSDF atlases used by the 3D text for the selected mono font
// (MONO_FONT in src/shared/flags.js), at the paths FONTS.mono.atlas expects.
// Run `npm run fonts:msdf` after adding a mono font.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, renameSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { FONTS } from '../src/shared/fonts.js';

const symbols = ' !@#$%^&*()';
const ATLASES = {
  msdf: { size: 512, charset: `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789${symbols}` },
  hint: { size: 256, charset: `ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789${symbols}[]-.,'/+:` },
};

const source = join('public', FONTS.mono.file);
if (!statSync(source).size) {
  console.error(`${source} is empty. Download the real font file (not a cloud placeholder) first.`);
  process.exit(1);
}
const name = basename(source, extname(source));

for (const [kind, { size, charset }] of Object.entries(ATLASES)) {
  const target = FONTS.mono.atlas[kind];
  const work = mkdtempSync(join(tmpdir(), 'msdf-'));
  const charsetFile = join(work, 'charset.txt');
  writeFileSync(charsetFile, charset);
  execFileSync('npx', [
    '-y', 'msdf-bmfont-xml', '-f', 'json', '-o', join(work, 'atlas'),
    '-s', '42', '-r', '4', '-p', '2', '-m', `${size},${size}`, '--pot', '--square',
    '-i', charsetFile, source,
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  const files = readdirSync(work);
  const font = JSON.parse(readFileSync(join(work, files.find(file => file.endsWith('.json'))), 'utf8'));
  if (font.pages.length !== 1) throw new Error(`${kind}: glyphs overflow a ${size}px atlas`);
  const out = join('public', target);
  mkdirSync(dirname(out), { recursive: true });
  font.pages = [`${name}.png`];
  renameSync(join(work, files.find(file => file.endsWith('.png'))), `${out}.png`);
  writeFileSync(`${out}.json`, JSON.stringify(font));
  rmSync(work, { recursive: true, force: true });
  console.log(`✓ ${out}.json (${font.chars.length} glyphs)`);
}
