// Coalesce only live invalidation hints. Durable notification rows are never dropped.
export function coalesceEvents(deliver, { delayMs = 50, maxKeys = 1000 } = {}) {
  const pending = new Map();
  let timer;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    const current = [...pending];
    pending.clear();
    for (const [key, value] of current) deliver(key, value);
  };
  return (key, value) => {
    if (!pending.has(key) && pending.size >= maxKeys) flush();
    pending.set(key, value);
    if (!timer) timer = setTimeout(flush, delayMs);
  };
}
