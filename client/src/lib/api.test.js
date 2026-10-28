// @vitest-environment node
import { afterEach, beforeAll, afterAll, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { api, setAccessToken, getAccessToken } from './api.js';
const base = 'http://localhost:5000/api/v1';
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());
it('sends JSON and credentials and reports unreadable/error responses', async () => {
  server.use(
    http.post(base + '/data', async ({ request }) => {
      expect(await request.json()).toEqual({ n: 1 });
      expect(request.headers.get('authorization')).toBe('Bearer abc');
      return HttpResponse.json({ data: { ok: true } });
    }),
  );
  setAccessToken('abc');
  expect(getAccessToken()).toBe('abc');
  expect(await api('/data', { method: 'POST', body: { n: 1 } })).toEqual({
    ok: true,
  });
  server.use(http.get(base + '/bad', () => HttpResponse.text('oops')));
  await expect(api('/bad')).rejects.toThrow('unreadable');
  server.use(
    http.get(base + '/failure', () =>
      HttpResponse.json({ message: 'Denied' }, { status: 403 }),
    ),
  );
  await expect(api('/failure')).rejects.toThrow('Denied');
});
it('single-flights refresh for concurrent expired access requests', async () => {
  let refreshed = 0;
  server.use(
    http.post(base + '/auth/refresh', async () => {
      refreshed++;
      await new Promise((r) => setTimeout(r, 10));
      return HttpResponse.json({ data: { accessToken: 'new' } });
    }),
    http.get(base + '/private', ({ request }) =>
      request.headers.get('authorization') === 'Bearer new'
        ? HttpResponse.json({ data: 7 })
        : HttpResponse.json({ message: 'Expired' }, { status: 401 }),
    ),
  );
  expect(await Promise.all([api('/private'), api('/private')])).toEqual([7, 7]);
  expect(refreshed).toBe(1);
});
it('clears failed refresh and never refreshes recursively', async () => {
  setAccessToken('old');
  server.use(
    http.get(base + '/private', () =>
      HttpResponse.json({ message: 'Expired' }, { status: 401 }),
    ),
    http.post(base + '/auth/refresh', () =>
      HttpResponse.json({ message: 'Sign in' }, { status: 401 }),
    ),
  );
  await expect(api('/private')).rejects.toThrow('Expired');
  expect(getAccessToken()).toBeNull();
});
