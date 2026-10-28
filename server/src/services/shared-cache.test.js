import { it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({
  connectFails: true,
  readFails: false,
  writeFails: false,
  value: null,
  quit: vi.fn(),
}));
vi.mock('redis', () => ({
  createClient: () => ({
    on: () => {},
    get isReady() {
      return !state.connectFails;
    },
    isOpen: true,
    connect: async () => {
      if (state.connectFails) throw new Error('offline');
    },
    get: async () => {
      if (state.readFails) throw new Error('read');
      return state.value;
    },
    set: async (_key, value) => {
      if (state.writeFails) throw new Error('write');
      state.value = value;
    },
    quit: state.quit,
  }),
}));
import {
  configureSharedCache,
  sharedGet,
  sharedSet,
  closeSharedCache,
} from './shared-cache.js';
it('falls back locally without Redis or after failed Redis connect', async () => {
  await configureSharedCache();
  expect(await sharedGet('none')).toBeUndefined();
  expect(await sharedSet('test', { value: 4 })).toEqual({ value: 4 });
  expect(await sharedGet('test')).toEqual({ value: 4 });
  await configureSharedCache('redis://localhost:6379');
  expect(await sharedGet('test')).toEqual({ value: 4 });
  await closeSharedCache();
});

it('uses Redis JSON, handles read/write failures and closes it', async () => {
  state.connectFails = false;
  await configureSharedCache('redis://localhost:6379');
  await sharedSet('redis', { ok: true });
  expect(await sharedGet('redis')).toEqual({ ok: true });
  state.readFails = true;
  expect(await sharedGet('redis')).toEqual({ ok: true });
  state.writeFails = true;
  await sharedSet('fallback', { local: true });
  expect(await sharedGet('fallback')).toEqual({ local: true });
  await closeSharedCache();
  expect(state.quit).toHaveBeenCalled();
});
