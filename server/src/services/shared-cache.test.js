import { it, expect, vi } from 'vitest';
vi.mock('redis', () => ({
  createClient: () => ({
    on: () => {},
    connect: async () => {
      throw new Error('offline');
    },
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
