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
it('logs in, logs out and clears failed restoration', async () => {
  api.mockResolvedValueOnce({ accessToken: 'a', user: { id: 'new' } });
  await useAuth
    .getState()
    .login({ email: 'demo@example.com', password: 'unused' });
  expect(useAuth.getState().user.id).toBe('new');
  api.mockResolvedValueOnce({});
  await useAuth.getState().logout();
  expect(useAuth.getState().user).toBeNull();
  api.mockRejectedValueOnce(new Error('expired'));
  await useAuth.getState().restore();
  expect(useAuth.getState().loading).toBe(false);
  expect(useAuth.getState().user).toBeNull();
});
