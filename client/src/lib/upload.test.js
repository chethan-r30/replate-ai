import { afterEach, expect, it, vi } from 'vitest';
import { uploadImage, setAccessToken } from './api.js';
afterEach(() => vi.unstubAllGlobals());
it('snapshots selected bytes into stable multipart blob without changing authorization', async () => {
  const fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ data: { url: '/synthetic' } }),
  }));
  vi.stubGlobal('fetch', fetch);
  setAccessToken('test-only-token');
  const arrayBuffer = vi.fn(async () => new Uint8Array([1, 2, 3]).buffer);
  const result = await uploadImage({
    name: 'synthetic.png',
    type: 'image/png',
    size: 3,
    arrayBuffer,
  });
  expect(result.url).toBe('/synthetic');
  expect(arrayBuffer).toHaveBeenCalledOnce();
  const options = fetch.mock.calls[0][1];
  expect(options.headers.Authorization).toBe('Bearer test-only-token');
  expect(options.credentials).toBe('include');
  expect(options.body.get('file').size).toBe(3);
  expect(options.body.get('file').name).toBe('synthetic.png');
});
it('rejects oversized input before allocating a byte snapshot or request', async () => {
  const arrayBuffer = vi.fn();
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(
    uploadImage({ size: 6 * 1024 * 1024, arrayBuffer }),
  ).rejects.toThrow('5 MiB');
  expect(arrayBuffer).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('retries transient selected-file backing error without duplicating a server request', async () => {
  const fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ data: { url: '/synthetic' } }),
  }));
  vi.stubGlobal('fetch', fetch);
  const e = new Error('temporary backing file');
  e.name = 'NotFoundError';
  const arrayBuffer = vi
    .fn()
    .mockRejectedValueOnce(e)
    .mockResolvedValue(new Uint8Array([1]).buffer);
  await uploadImage({
    name: 'image.png',
    type: 'image/png',
    size: 1,
    arrayBuffer,
  });
  expect(arrayBuffer).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenCalledOnce();
});
