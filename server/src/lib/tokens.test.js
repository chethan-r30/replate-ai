import { it, expect, vi } from 'vitest';
import {
  signAccess,
  signRefresh,
  verifyToken,
  digest,
  opaqueToken,
  tokenId,
} from './tokens.js';
const config = {
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
};
it('generates distinct opaque tokens/digests and enforces JWT purpose', () => {
  const user = { _id: '507f1f77bcf86cd799439011' };
  const a = signAccess(user, config),
    r = signRefresh(user, 'family', config);
  expect(verifyToken(a, 'access', config).sub).toBe(user._id);
  expect(verifyToken(r, 'refresh', config).family).toBe('family');
  expect(() => verifyToken(a, 'refresh', config)).toThrow('Invalid');
  expect(() => verifyToken(a + 'x', 'access', config)).toThrow('Invalid');
  expect(opaqueToken()).toMatch(/^[a-f0-9]{64}$/);
  expect(tokenId()).not.toBe(tokenId());
  expect(digest('token')).toHaveLength(64);
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 16 * 60000);
  expect(() => verifyToken(a, 'access', config)).toThrow('expired');
  vi.useRealTimers();
});
