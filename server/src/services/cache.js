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
  generation++;
  inFlight.clear();
  values.clear();
}
// Share only overlapping public reads; invalidation prevents stale in-flight refills.
const inFlight = new Map();
let generation = 0;
export async function cachedLoad(key, load, ttlMs = 1000) {
  const value = cached(key);
  if (value !== undefined) return value;
  if (inFlight.has(key)) return inFlight.get(key);
  if (inFlight.size >= 1000) return load();
  const version = generation;
  const promise = Promise.resolve()
    .then(load)
    .then((data) => {
      if (version === generation) cache(key, data, ttlMs);
      return data;
    })
    .finally(() => {
      if (inFlight.get(key) === promise) inFlight.delete(key);
    });
  inFlight.set(key, promise);
  return promise;
}
