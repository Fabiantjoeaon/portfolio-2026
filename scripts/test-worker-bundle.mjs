// Run after `npm run build`. WebKit must never import the worker entry back
// into its module graph: the entry and imported module can get separate TSL state.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('production worker entry is isolated from shared shader modules', async () => {
  const assets = new URL('../dist/assets/', import.meta.url);
  const files = (await readdir(assets)).filter(name => name.endsWith('.js'));
  const chunks = await Promise.all(files.map(async name => ({
    name, source: await readFile(new URL(name, assets), 'utf8'),
  })));
  const entries = new Set(chunks.flatMap(({ source }) =>
    [...source.matchAll(/new Worker\([\s\S]{0,120}?["'][^"']*\/(offscreen-[^"']+\.js)["']/g)]
      .map(match => match[1])));
  assert.equal(entries.size, 1, 'Expected one rendering worker entry');
  const [entry] = entries;
  const facade = chunks.find(chunk => chunk.name === entry);
  assert(facade, 'Worker entry exists');
  assert.match(facade.source.trim(), /^import ["']\.\/[^"']+\.js["'];$/, 'Entry only imports its runtime');
  for (const { name, source } of chunks) {
    assert(!source.includes(`./${entry}`), `${name} imports the worker entry back into the module graph`);
  }
});
