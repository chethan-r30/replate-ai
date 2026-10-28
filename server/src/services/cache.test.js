import { it, expect } from 'vitest';
import { cachedLoad, cached, clearCache } from './cache.js';
it('coalesces public misses and prevents invalidated in-flight cache refill', async () => {
  clearCache();
  let calls = 0,
    release;
  const load = () => {
    calls++;
    return new Promise((r) => {
      release = r;
    });
  };
  const a = cachedLoad('shared', load),
    b = cachedLoad('shared', load);
  await Promise.resolve();
  expect(calls).toBe(1);
  clearCache();
  release({ old: true });
  expect(await a).toEqual({ old: true });
  expect(await b).toEqual({ old: true });
  expect(cached('shared')).toBeUndefined();
  expect(await cachedLoad('shared', async () => ({ fresh: true }))).toEqual({
    fresh: true,
  });
  expect(
    await cachedLoad('shared', async () => {
      throw new Error('should not load');
    }),
  ).toEqual({ fresh: true });
  clearCache();
  await expect(
    cachedLoad('fail', async () => {
      throw new Error('down');
    }),
  ).rejects.toThrow('down');
  expect(await cachedLoad('fail', async () => 1)).toBe(1);
});
