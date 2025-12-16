let cachedParams = null;

function ensureParams() {
  if (!cachedParams) {
    if (typeof window !== "undefined") {
      cachedParams = new URLSearchParams(window.location.search);
    } else {
      cachedParams = new URLSearchParams();
    }
  }

  return cachedParams;
}

export function getParam(name, defaultValue = null) {
  const params = ensureParams();
  if (!params.has(name)) return defaultValue;
  return params.get(name);
}

export function getFlag(name) {
  const params = ensureParams();
  if (!params.has(name)) return false;
  const v = params.get(name);
  // Allow ?flag, ?flag=1, ?flag=true, ?flag=yes
  if (v === null || v === "") return true;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export function getNumber(name, defaultValue = null) {
  const v = getParam(name, null);
  if (v === null) return defaultValue;
  const n = Number(v);
  return Number.isFinite(n) ? n : defaultValue;
}

export function getBoolean(name, defaultValue = false) {
  const params = ensureParams();
  if (!params.has(name)) return defaultValue;
  return getFlag(name);
}

