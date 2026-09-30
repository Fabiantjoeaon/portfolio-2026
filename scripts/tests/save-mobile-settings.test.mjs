import assert from "node:assert/strict";
import fs from "node:fs";
import { Readable } from "node:stream";
import test from "node:test";
import { applyMobileSettings, saveParamsPlugin } from "../../vite/saveParamsPlugin.js";

const source = `// Touch-only overrides. Desktop scene parameters remain independent.
export const mobileSettings = {
  hoverStrength: 4,
  tileGap: 0.1, // Fraction of each cell left open between tiles.
  portrait: {
    portraitEnabled: true,
    portraitDither: 0.15,
    portraitColor: 0xbfbfbf,
    portraitLightDirection: [2, 2, 0.15],
  },
};
`;

test("mobile save rewrites changed literals and keeps comments", () => {
  const next = applyMobileSettings(source, {
    hoverStrength: 3,
    tileGap: 0.1,
    portrait: {
      portraitEnabled: false,
      portraitDither: 0.2,
      portraitColor: 0xff0000,
      portraitLightDirection: [2, 2, 0.4],
    },
  });
  assert.match(next, /hoverStrength: 3,/);
  assert.match(next, /tileGap: 0\.1, \/\/ Fraction of each cell left open between tiles\./);
  assert.match(next, /portraitEnabled: false,/);
  assert.match(next, /portraitDither: 0\.2,/);
  assert.match(next, /portraitColor: 0xff0000,/);
  assert.match(next, /portraitLightDirection: \[2, 2, 0\.4\],/);
  assert.equal(applyMobileSettings(next, {
    hoverStrength: 3,
    tileGap: 0.1,
    portrait: {
      portraitEnabled: false,
      portraitDither: 0.2,
      portraitColor: 0xff0000,
      portraitLightDirection: [2, 2, 0.4],
    },
  }), next);
});

test("saving mobile settings writes the js file", async (t) => {
  let handler;
  saveParamsPlugin().configureServer({
    middlewares: {
      use(path, callback) {
        assert.equal(path, "/__save-params");
        handler = callback;
      },
    },
  });
  let written;
  t.mock.method(fs, "readFileSync", (path) =>
    String(path).endsWith("mobileSettings.js") ? source : "export const params = {};",
  );
  t.mock.method(fs, "writeFileSync", (path, content) => {
    assert.ok(String(path).endsWith("mobileSettings.js"));
    written = content;
  });
  const req = Readable.from([
    Buffer.from(JSON.stringify({
      updates: {},
      files: {
        mobileSettings: JSON.stringify({
          hoverStrength: 3,
          tileGap: 0.1,
          portrait: { portraitDither: 0.2, portraitColor: 0xbfbfbf },
        }),
      },
    })),
  ]);
  req.method = "POST";
  const res = { setHeader() {}, end(body) { this.body = JSON.parse(body); } };
  await handler(req, res, () => assert.fail("POST was not handled"));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.changed, true);
  assert.match(written, /hoverStrength: 3,/);
  assert.match(written, /portraitDither: 0\.2,/);
  assert.match(written, /portraitColor: 0xbfbfbf,/);
});
