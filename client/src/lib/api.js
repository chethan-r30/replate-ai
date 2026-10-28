// Tokens stay in memory. Refresh uses the httpOnly cookie, never localStorage.
import { z } from 'zod';
const config = z.object({ VITE_API_URL: z.string().url() }).parse({
  VITE_API_URL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1',
});
let accessToken = null;
let refreshing;
export const getAccessToken = () => accessToken;
export const setAccessToken = (token) => {
  accessToken = token;
};
export async function api(path, { method = 'GET', body, retry = true } = {}) {
  const response = await fetch(`${config.VITE_API_URL}${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    try {
      if (!refreshing)
        refreshing = api('/auth/refresh', {
          method: 'POST',
          body: {},
          retry: false,
        }).finally(() => {
          refreshing = null;
        });
      const data = await refreshing;
      setAccessToken(data.accessToken);
      return api(path, { method, body, retry: false });
    } catch {
      setAccessToken(null);
    }
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('The server returned an unreadable response');
  }
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data.data;
}
