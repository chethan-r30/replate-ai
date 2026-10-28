// Coalesce overlapping live reads, never cache a completed permission snapshot.
export function batchRead(fetchRows, keyOf, { delayMs = 3 } = {}) {
  let queue = [];
  let timer;
  return (key) =>
    new Promise((resolve, reject) => {
      queue.push({ key: String(key), resolve, reject });
      if (!timer)
        timer = setTimeout(async () => {
          timer = undefined;
          const current = queue;
          queue = [];
          try {
            const rows = await fetchRows([
              ...new Set(current.map((x) => x.key)),
            ]);
            const index = new Map(rows.map((x) => [String(keyOf(x)), x]));
            for (const item of current)
              item.resolve(index.get(item.key) || null);
          } catch (error) {
            for (const item of current) item.reject(error);
          }
        }, delayMs);
    });
}
