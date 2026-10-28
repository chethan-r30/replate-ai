// Exercise auth against a real disposable MongoDB, including replay and role checks.
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { User } from './models/User.js';
import { RefreshToken } from './models/RefreshToken.js';
import { ActionToken } from './models/ActionToken.js';
import { Organization } from './models/Organization.js';
import { readDevInbox } from './lib/mail.js';
const config = {
  ...parseEnv({
    NODE_ENV: 'test',
    CLIENT_URL: 'http://localhost:5173',
    MONGODB_URI: 'mongodb://localhost/test',
    JWT_ACCESS_SECRET: 'a'.repeat(48),
    JWT_REFRESH_SECRET: 'b'.repeat(48),
    RATE_LIMIT_MAX: 10000,
  }),
  LOCAL_SANDBOX: true,
};
const app = createApp(config);
let mongo;
let ip = 0;
const signup = (email = 'restaurant@example.com', role = 'restaurant') => ({
  name: 'Demo User',
  email,
  password: 'StrongPass123!',
  role,
});
async function register(email, role) {
  return request(app).post('/api/v1/auth/register').send(signup(email, role));
}
async function login(email = 'restaurant@example.com') {
  return request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'StrongPass123!' });
}
const proof = {
  name: 'Demo Kitchen',
  registrationNo: 'REG123',
  address: '123 Main Street',
  location: { type: 'Point', coordinates: [77.59, 12.97] },
  verificationDocs: ['https://example.com/proof.pdf'],
};
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    User.init(),
    RefreshToken.init(),
    ActionToken.init(),
    Organization.init(),
  ]);
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})),
  );
  ip++;
});
describe('authentication and RBAC', () => {
  it('registers with bcrypt hash, verifies once and protects profile', async () => {
    const email = `user${ip}@example.com`;
    const r = await register(email);
    expect(r.status).toBe(201);
    expect(r.body.data.emailSent).toBe(false);
    expect(r.body.data.user.passwordHash).toBeUndefined();
    const user = await User.findOne({ email }).select('+passwordHash');
    expect(user.passwordHash).toMatch(/^\$2[ab]\$12\$/);
    const token = new URL(readDevInbox(email).at(-1).url).searchParams.get(
      'token',
    );
    expect(
      (await request(app).post('/api/v1/auth/verify-email').send({ token }))
        .status,
    ).toBe(200);
    expect(
      (await request(app).post('/api/v1/auth/verify-email').send({ token }))
        .status,
    ).toBe(400);
    const l = await login(email);
    expect(l.status).toBe(200);
    expect(l.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(l.headers['set-cookie'][0]).toContain('SameSite=Strict');
    expect(
      (
        await request(app)
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${l.body.data.accessToken}`)
      ).body.data.isEmailVerified,
    ).toBe(true);
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
  });
  it('rejects admin self-registration and unknown fields', async () => {
    expect((await register('adminbad@example.com', 'admin')).status).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/register')
          .send({ ...signup('extra@example.com'), isEmailVerified: true })
      ).status,
    ).toBe(400);
  });
  it('rotates refresh tokens and revokes entire family after reuse', async () => {
    const email = `rotate${ip}@example.com`;
    await register(email);
    const l = await login(email);
    const old = l.headers['set-cookie'][0].split(';')[0];
    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', old)
      .send({});
    expect(refreshed.status).toBe(200);
    const next = refreshed.headers['set-cookie'][0].split(';')[0];
    expect(next).not.toBe(old);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/refresh')
          .set('Cookie', old)
          .send({})
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/refresh')
          .set('Cookie', next)
          .send({})
      ).status,
    ).toBe(401);
  });
  it('rejects tampering and cross-origin refresh', async () => {
    expect(
      (
        await request(app)
          .get('/api/v1/auth/me')
          .set('Authorization', 'Bearer bad.token.value')
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/refresh')
          .set('Origin', 'https://evil.example')
          .send({})
      ).status,
    ).toBe(403);
  });
  it('resets passwords once and revokes existing sessions', async () => {
    const email = `reset${ip}@example.com`;
    await register(email);
    const l = await login(email);
    expect(
      (await request(app).post('/api/v1/auth/forgot-password').send({ email }))
        .status,
    ).toBe(200);
    const token = new URL(readDevInbox(email).at(-1).url).searchParams.get(
      'token',
    );
    expect(
      (
        await request(app)
          .post('/api/v1/auth/reset-password')
          .send({ token, password: 'NewStrongPass123!' })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/reset-password')
          .send({ token, password: 'NewStrongPass123!' })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/refresh')
          .set('Cookie', l.headers['set-cookie'][0].split(';')[0])
          .send({})
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/login')
          .send({ email, password: 'NewStrongPass123!' })
      ).status,
    ).toBe(200);
  });
  it('locks out after repeated password failures', async () => {
    const email = `lock${ip}@example.com`;
    await register(email);
    for (let n = 0; n < 5; n++)
      expect(
        (
          await request(app)
            .post('/api/v1/auth/login')
            .send({ email, password: 'bad' })
        ).status,
      ).toBe(401);
    expect((await login(email)).status).toBe(429);
  });
  it('requires admin for approval and rejects ownership violations', async () => {
    const email = `org${ip}@example.com`;
    await register(email);
    const l = await login(email);
    const auth = `Bearer ${l.body.data.accessToken}`;
    const org = await request(app)
      .post('/api/v1/organizations')
      .set('Authorization', auth)
      .send(proof);
    expect(org.status).toBe(201);
    expect(
      (
        await request(app)
          .get('/api/v1/organizations')
          .set('Authorization', auth)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/v1/organizations/${org.body.data._id}/verify`)
          .set('Authorization', auth)
          .send({ status: 'approved', reason: 'Checked proof' })
      ).status,
    ).toBe(403);
    await User.updateOne({ email }, { $set: { role: 'admin' } });
    const approved = await request(app)
      .post(`/api/v1/organizations/${org.body.data._id}/verify`)
      .set('Authorization', auth)
      .send({ status: 'approved', reason: 'Checked proof' });
    expect(approved.status).toBe(200);
    expect((await User.findOne({ email })).verificationStatus).toBe('approved');
    const other = `other${ip}@example.com`;
    await register(other);
    const otherLogin = await login(other);
    expect(
      (
        await request(app)
          .get(`/api/v1/organizations/${org.body.data._id}`)
          .set('Authorization', `Bearer ${otherLogin.body.data.accessToken}`)
      ).status,
    ).toBe(403);
  });
});
