// Reference must cover deployed routes without widening auth or weakening CSP.
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { openapi } from './openapi.js';
const config = parseEnv({
  NODE_ENV: 'test',
  CLIENT_URL: 'http://localhost:5173',
  MONGODB_URI: 'mongodb://localhost/test',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
});
describe('OpenAPI reference', () => {
  it('serves local Swagger UI and raw OpenAPI with restrictive asset CSP', async () => {
    const app = createApp(config);
    const spec = await request(app).get('/api/openapi.json');
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toBe('3.1.0');
    const page = await request(app).get('/api/docs/');
    expect(page.status).toBe(200);
    expect(page.text).toContain('swagger-ui');
    expect(page.headers['content-security-policy']).toContain(
      "script-src 'self'",
    );
    const asset = await request(app).get('/api/docs/swagger-ui-init.js');
    expect(asset.status).toBe(200);
    expect(asset.text).toContain('supportedSubmitMethods');
    expect(
      (await request(app).get('/api/v1/health')).headers[
        'content-security-policy'
      ],
    ).toContain("default-src 'none'");
  });
  it('documents strict payloads, all claim actions, privacy and admin routes', () => {
    expect(Object.keys(openapi.paths)).toHaveLength(40);
    expect(openapi.paths['/listings/{id}'].delete).toBeTruthy();
    for (const action of [
      'approve',
      'reject',
      'cancel',
      'confirm-pickup',
      'no-show',
      'feedback',
    ])
      expect(openapi.paths['/claims/{id}/' + action].post).toBeTruthy();
    expect(
      openapi.components.schemas.Register.properties.role.enum,
    ).not.toContain('admin');
    expect(openapi.components.schemas.Listing.additionalProperties).toBe(false);
    expect(
      openapi.components.schemas.Listing.properties.bestBefore.format,
    ).toBe('date-time');
    expect(openapi.paths['/auth/me'].delete.requestBody).toBeTruthy();
    expect(openapi.paths['/admin/audit'].get.security).toEqual([
      { bearerAuth: [] },
    ]);
    expect(openapi.paths['/analytics/public'].get.security).toEqual([]);
  });
});
