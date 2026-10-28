import { it, expect, vi } from 'vitest';
import { batchRead } from './read-batch.js';
it('coalesces overlapping reads without caching finished permissions', async () => {
  const fetch = vi.fn().mockResolvedValue([{ id: 'u', role: 'ngo' }]);
  const read = batchRead(fetch, (x) => x.id);
  expect(await Promise.all([read('u'), read('u'), read('missing')])).toEqual([
    { id: 'u', role: 'ngo' },
    { id: 'u', role: 'ngo' },
    null,
  ]);
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValueOnce([{ id: 'u', role: 'volunteer' }]);
  expect((await read('u')).role).toBe('volunteer');
  fetch.mockRejectedValueOnce(new Error('down'));
  await expect(read('u')).rejects.toThrow('down');
});
