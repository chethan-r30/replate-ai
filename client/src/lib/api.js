// Tokens stay in memory. Refresh uses the httpOnly cookie, never localStorage.
import { z } from 'zod';
const config = z
  .object({ VITE_API_URL: z.union([z.string().url(), z.literal('/api/v1')]) })
  .parse({
    VITE_API_URL:
      import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1',
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

export async function uploadImage(file, path = '/uploads') {
  const body = new FormData();
  body.append('file', file);
  const response = await fetch(`${config.VITE_API_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getAccessToken()}` },
    body,
    credentials: 'include',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Upload failed');
  return data.data;
}
export async function readProof(path) {
  const response = await fetch(`${config.VITE_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
    credentials: 'include',
  });
  if (!response.ok)
    throw new Error('Could not open proof. Please sign in again or retry.');
  return response.blob();
}

export async function removeUpload(path) {
  return api(`/uploads/${path.split('/').pop()}`, { method: 'DELETE' });
}
