// Verify strict startup validation and consistent health/error responses.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { parseEnv, hasKey } from './config/env.js';
import { createApp } from './app.js';
const valid = {
  NODE_ENV: 'test',
  CLIENT_URL: 'http://localhost:5173',
  MONGODB_URI: 'mongodb://localhost/test',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
  RATE_LIMIT_MAX: 1000,
};
describe('foundation', () => {
  it('rejects placeholders and lists bad fields', () => {
    expect(() =>
      parseEnv({
        ...valid,
        JWT_ACCESS_SECRET: 'REPLACE_ME',
        MONGODB_URI: 'REPLACE_ME',
      }),
    ).toThrow(/MONGODB_URI.*JWT_ACCESS_SECRET/);
  });
  it('requires production HTTPS', () => {
    expect(() => parseEnv({ ...valid, NODE_ENV: 'production' })).toThrow(
      /HTTPS/,
    );
  });
  it('recognizes missing optional keys', () => {
    expect(hasKey('REPLACE_ME')).toBe(false);
    expect(hasKey(undefined)).toBe(false);
  });
  it('returns health, readiness and safe 404 responses', async () => {
    const app = createApp(parseEnv(valid));
    expect((await request(app).get('/api/v1/health')).body.data.status).toBe(
      'up',
    );
    expect((await request(app).get('/api/v1/ready')).status).toBe(503);
    const missing = await request(app).get('/missing');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ success: false, message: 'Not found' });
  });
  it('keeps health probes outside user limits without exempting API traffic', async () => {
    const app = createApp(parseEnv({ ...valid, RATE_LIMIT_MAX: 2 }));
    for (let n = 0; n < 5; n++)
      expect((await request(app).get('/api/v1/health')).status).toBe(200);
    expect((await request(app).get('/api/v1/health?bad=true')).status).toBe(
      400,
    );
    expect((await request(app).get('/unknown')).status).toBe(404);
    expect((await request(app).get('/unknown')).status).toBe(404);
    expect((await request(app).get('/unknown')).status).toBe(429);
  });
  it('rejects unknown query fields and Mongo operators', async () => {
    const app = createApp(parseEnv(valid));
    expect((await request(app).get('/api/v1/health?foo=bar')).status).toBe(400);
    expect((await request(app).get('/api/v1/health?$where=bad')).status).toBe(
      400,
    );
  });
});
