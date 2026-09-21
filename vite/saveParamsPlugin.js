import fs from "node:fs";
import { fileURLToPath } from "node:url";

const PARAMS_FILE = fileURLToPath(
  new URL("../src/offscreen/params.js", import.meta.url),
);
const ENDPOINT = "/__save-params";

export function saveParamsPlugin() {
  return {
    name: "save-params",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(ENDPOINT, async (req, res, next) => {
        if (req.method !== "POST") return next();

        try {
          const body = await readBody(req);
          const { updates } = JSON.parse(body || "{}");
          if (!updates || typeof updates !== "object") {
            throw new Error("expected { updates }");
          }

          const source = fs.readFileSync(PARAMS_FILE, "utf8");
          const nextSource = applyParamUpdates(source, updates);
          const changed = nextSource !== source;
          if (changed) fs.writeFileSync(PARAMS_FILE, nextSource);

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              ok: true,
              changed,
              count: Object.keys(updates).length,
            }),
          );
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: String(error.message) }));
        }
      });
    },
  };
}

export function applyParamUpdates(source, updates) {
  const start = findParamsObject(source);
  if (start < 0) throw new Error("export const params not found");

  const replacements = [];
  walkObject(source, start, "", updates, replacements);

  if (!replacements.length) return source;

  replacements.sort((a, b) => b.start - a.start);
  let out = source;
  for (const { start: from, end, text } of replacements) {
    out = out.slice(0, from) + text + out.slice(end);
  }
  return out;
}

export function formatParamLiteral(update) {
  if (update.type === "color") {
    return "0x" + (Number(update.value) >>> 0).toString(16).padStart(6, "0");
  }
  if (update.type === "boolean") return update.value ? "true" : "false";
  if (update.type === "string") return JSON.stringify(update.value);
  if (update.type === "array") {
    return `[${update.value.map((v) => (typeof v === "number" ? formatNumber(v) : JSON.stringify(v))).join(", ")}]`;
  }
  return formatNumber(update.value, update.step);
}

function findParamsObject(source) {
  const match = source.match(/export\s+const\s+params\s*=/);
  if (!match) return -1;
  let i = skip(source, match.index + match[0].length);
  return source[i] === "{" ? i : -1;
}

function walkObject(source, openBrace, path, updates, replacements) {
  let i = openBrace + 1;
  while (i < source.length) {
    i = skip(source, i);
    if (i >= source.length || source[i] === "}") break;

    const keyRes = readKey(source, i);
    if (!keyRes) break;
    i = skip(source, keyRes.next);
    if (source[i] !== ":") break;
    i = skip(source, i + 1);

    const value = readValue(source, i);
    const childPath = path ? `${path}.${keyRes.key}` : keyRes.key;

    if (value.isObject) {
      if (updates[childPath]) {
        replaceLeafValue(source, value.start, updates[childPath], replacements);
      } else {
        walkObject(source, value.start, childPath, updates, replacements);
      }
    }

    i = value.end;
    i = skip(source, i);
    if (source[i] === ",") i++;
  }
}

function replaceLeafValue(source, openBrace, update, replacements) {
  let i = openBrace + 1;
  while (i < source.length) {
    i = skip(source, i);
    if (i >= source.length || source[i] === "}") break;

    const keyRes = readKey(source, i);
    if (!keyRes) break;
    i = skip(source, keyRes.next);
    if (source[i] !== ":") break;
    i = skip(source, i + 1);

    const value = readValue(source, i);
    if (keyRes.key === "value") {
      const text = formatParamLiteral(update);
      if (source.slice(value.start, value.end) !== text) {
        replacements.push({ start: value.start, end: value.end, text });
      }
      return;
    }

    i = value.end;
    i = skip(source, i);
    if (source[i] === ",") i++;
  }
}

function readKey(source, i) {
  i = skip(source, i);
  if (source[i] === '"' || source[i] === "'") {
    const end = skipString(source, i);
    return { key: source.slice(i + 1, end - 1), next: end };
  }
  const match = source.slice(i).match(/^[A-Za-z_$][\w$]*/);
  if (!match) return null;
  return { key: match[0], next: i + match[0].length };
}

function readValue(source, i) {
  i = skip(source, i);
  const start = i;
  if (source[i] === "{") {
    return { start, end: matchPair(source, i, "{", "}"), isObject: true };
  }
  if (source[i] === "[") {
    return { start, end: matchPair(source, i, "[", "]"), isArray: true };
  }
  if (source[i] === '"' || source[i] === "'" || source[i] === "`") {
    return { start, end: skipString(source, i) };
  }
  while (i < source.length) {
    const c = source[i];
    if (
      c === "," ||
      c === "}" ||
      c === "]" ||
      c === "\n" ||
      c === "\r" ||
      c === " " ||
      c === "\t" ||
      (c === "/" && (source[i + 1] === "/" || source[i + 1] === "*"))
    ) {
      break;
    }
    i++;
  }
  return { start, end: i };
}

function matchPair(source, start, open, close) {
  let depth = 0;
  let i = start;
  while (i < source.length) {
    const c = source[i];
    if (c === '"' || c === "'" || c === "`") {
      i = skipString(source, i);
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      i = source.indexOf("\n", i);
      if (i < 0) return source.length;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return source.length;
}

function skipString(source, i) {
  const q = source[i];
  i++;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source[i] === q) return i + 1;
    i++;
  }
  return source.length;
}

function skip(source, i) {
  while (i < source.length) {
    const c = source[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      i = source.indexOf("\n", i);
      if (i < 0) return source.length;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    break;
  }
  return i;
}

function formatNumber(n, step) {
  if (!Number.isFinite(n)) return String(n);
  if (step != null && step > 0) {
    const decimals = decimalPlaces(step);
    n = Number((Math.round(n / step) * step).toFixed(decimals));
  }
  if (Object.is(n, -0)) n = 0;
  return String(n);
}

function decimalPlaces(step) {
  const text = String(step);
  const exp = text.match(/e-(\d+)$/i);
  if (exp) return Number(exp[1]);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
