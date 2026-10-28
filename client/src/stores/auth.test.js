// Two StrictMode mounts share one refresh request and cannot trigger replay revocation.
import { it, expect, vi } from 'vitest';
vi.mock('../lib/api.js', () => ({ api: vi.fn(), setAccessToken: vi.fn() }));
import { api } from '../lib/api.js';
import { useAuth } from './auth.js';
it('deduplicates simultaneous session restore', async () => {
  let finish;
  api.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const a = useAuth.getState().restore();
  const b = useAuth.getState().restore();
  expect(api).toHaveBeenCalledTimes(1);
  finish({ user: { id: 'u', name: 'Demo' }, accessToken: 'test-token' });
  await Promise.all([a, b]);
  expect(useAuth.getState().user.id).toBe('u');
});
