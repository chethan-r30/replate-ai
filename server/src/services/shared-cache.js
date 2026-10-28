// Optional Redis cache; bounded local fallback keeps Redis outages nonfatal.
import { createClient } from 'redis';
import { cache, cached } from './cache.js';
import { logger } from '../lib/logger.js';
let redis;
export async function configureSharedCache(url) {
  if (!url || url.includes('REPLACE_ME')) return;
  redis = createClient({
    url,
    socket: { connectTimeout: 2000, reconnectStrategy: false },
  });
  redis.on('error', () =>
    logger.warn('Redis unavailable; local cache selected'),
  );
  try {
    await redis.connect();
  } catch {
    redis = undefined;
  }
}
export async function sharedGet(key) {
  if (redis?.isReady)
    try {
      const value = await redis.get('replate:' + key);
      if (value) return JSON.parse(value);
    } catch {
      logger.warn('Cache read failed');
    }
  return cached(key);
}
export async function sharedSet(key, value, ttlMs = 21600000) {
  cache(key, value, ttlMs);
  if (redis?.isReady)
    try {
      await redis.set('replate:' + key, JSON.stringify(value), { PX: ttlMs });
    } catch {
      logger.warn('Cache write failed');
    }
  return value;
}
export async function closeSharedCache() {
  if (redis?.isOpen) await redis.quit();
  redis = undefined;
}
