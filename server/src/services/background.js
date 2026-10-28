// Track best-effort work so shutdown and test cleanup can wait for real completion.
const pending = new Set();
export function trackBackground(promise) {
  pending.add(promise);
  promise.finally(() => pending.delete(promise)).catch(() => {});
  return promise;
}
export async function drainBackground() {
  while (pending.size) await Promise.allSettled([...pending]);
}
