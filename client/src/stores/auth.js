// Store only the current public user in memory and restore via refresh cookie.
import { create } from 'zustand';
import { api, setAccessToken } from '../lib/api.js';
export const useAuth = create((set) => ({
  user: null,
  loading: true,
  login: async (values) => {
    const data = await api('/auth/login', { method: 'POST', body: values });
    setAccessToken(data.accessToken);
    set({ user: data.user, loading: false });
  },
  restore: async () => {
    try {
      const data = await api('/auth/refresh', { method: 'POST', body: {} });
      setAccessToken(data.accessToken);
      set({ user: data.user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },
  logout: async () => {
    await api('/auth/logout', { method: 'POST', body: {} });
    setAccessToken(null);
    set({ user: null });
  },
}));
