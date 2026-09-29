import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import test from 'node:test';
import { saveParamsPlugin } from '../../vite/saveParamsPlugin.js';
import {
  applyTimingSettings, collectTimingSettings, sharedTimings, transitionTimings,
} from '../../src/shared/timings.js';

test('saving timings writes JSON and restores shared and route values', async t => {
  const original = collectTimingSettings();
  let handler;
  saveParamsPlugin().configureServer({ middlewares: { use(path, callback) {
    assert.equal(path, '/__save-params');
    handler = callback;
  } } });
  let written;
  t.mock.method(fs, 'readFileSync', path => path.endsWith('timings.saved.json')
    ? '{}' : 'export const params = {};');
  t.mock.method(fs, 'writeFileSync', (path, content) => {
    assert.ok(path.endsWith('timings.saved.json'));
    written = content;
  });
  const request = async files => {
    const req = Readable.from([Buffer.from(JSON.stringify({ updates: {}, files }))]);
    req.method = 'POST';
    const res = { setHeader() {}, end(body) { this.body = JSON.parse(body); } };
    await handler(req, res, () => assert.fail('POST was not handled'));
    return res;
  };
  try {
    sharedTimings.tiles.duration = 2.8;
    transitionTimings.projectToHome.homeReturn.wipeEase = 'linear';
    const content = JSON.stringify(collectTimingSettings());
    const result = await request({ timingOverrides: content });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.changed, true);
    assert.equal(written, content);
    applyTimingSettings(original);
    applyTimingSettings(JSON.parse(written));
    assert.equal(sharedTimings.tiles.duration, 2.8);
    assert.equal(transitionTimings.projectToHome.homeReturn.wipeEase, 'linear');
    assert.equal(transitionTimings.aboutToHome.homeReturn.wipeEase,
      original.transitions.aboutToHome.homeReturn.wipeEase);

    written = undefined;
    const invalid = await request({ timingOverrides: '{"shared":{"tiles":{"duration":"oops"}}}' });
    assert.equal(invalid.statusCode, 500);
    assert.equal(written, undefined);
    const unknown = await request({ timingOverrides: '{"shared":{"tiles":{"missing":1}}}' });
    assert.equal(unknown.statusCode, 500);
    assert.equal(written, undefined);
  } finally { applyTimingSettings(original); }
});
