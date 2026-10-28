// Deduplicate session restoration so StrictMode cannot rotate one cookie twice.
import { create } from 'zustand';
import { api, setAccessToken } from '../lib/api.js';
let restoring;
export const useAuth = create((set) => ({
  user: null,
  loading: true,
  login: async (values) => {
    const data = await api('/auth/login', { method: 'POST', body: values });
    setAccessToken(data.accessToken);
    set({ user: data.user, loading: false });
  },
  restore: () => {
    if (restoring) return restoring;
    restoring = (async () => {
      try {
        const data = await api('/auth/refresh', { method: 'POST', body: {} });
        setAccessToken(data.accessToken);
        set({ user: data.user, loading: false });
      } catch {
        setAccessToken(null);
        set({ user: null, loading: false });
      } finally {
        restoring = null;
      }
    })();
    return restoring;
  },
  logout: async () => {
    await api('/auth/logout', { method: 'POST', body: {} });
    setAccessToken(null);
    set({ user: null });
  },
}));
