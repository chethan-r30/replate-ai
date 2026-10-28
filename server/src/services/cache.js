// Bounded process-local cache; optional Redis support is added during optimization.
const values = new Map();
export function cached(key) {
  const value = values.get(key);
  if (!value || value.expires < Date.now()) {
    values.delete(key);
    return undefined;
  }
  return value.data;
}
export function cache(key, data, ttlMs = 21600000) {
  if (values.size >= 1000) values.delete(values.keys().next().value);
  values.set(key, { data, expires: Date.now() + ttlMs });
  return data;
}
export function clearCache() {
  values.clear();
}
