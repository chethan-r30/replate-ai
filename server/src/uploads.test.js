import { beforeAll, afterAll, afterEach, it, expect, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
const { uploadStream, originUrl } = vi.hoisted(() => ({
  uploadStream: vi.fn(),
  originUrl: vi.fn(),
}));
vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    uploader: { upload_stream: uploadStream },
    url: originUrl,
  },
}));
import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { User } from './models/User.js';
import { Organization } from './models/Organization.js';
import { ProofUpload } from './models/ProofUpload.js';
import { signAccess } from './lib/tokens.js';
let mongo, owner, stranger, admin;
const config = parseEnv({
  NODE_ENV: 'test',
  CLIENT_URL: 'http://localhost:5173',
  MONGODB_URI: 'mongodb://localhost/test',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
  RATE_LIMIT_MAX: 10000,
  CLOUDINARY_CLOUD_NAME: 'synthetic',
  CLOUDINARY_API_KEY: 'synthetic-key',
  CLOUDINARY_API_SECRET: 'synthetic-secret',
});
const app = createApp(config);
const auth = (u) => `Bearer ${signAccess(u, config)}`;
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPioAAAAASUVORK5CYII=',
  'base64',
);
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  const make = (email, role) =>
    User.create({
      name: 'Synthetic',
      email,
      role,
      passwordHash: 'unused',
      isEmailVerified: true,
    });
  owner = await make('owner@test.invalid', 'restaurant');
  stranger = await make('other@test.invalid', 'ngo');
  admin = await make('admin@test.invalid', 'admin');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
it('separates public photos from authenticated proof and never returns proof origin', async () => {
  uploadStream.mockImplementation((_options, done) => ({
    end: () =>
      done(null, {
        public_id: 'replate-proof/random',
        secure_url: 'https://res.cloudinary.com/private-secret',
      }),
  }));
  const result = await request(app)
    .post('/api/v1/uploads/proof')
    .set('Authorization', auth(owner))
    .attach('file', png, 'proof.png');
  expect(result.status).toBe(201);
  expect(result.body.data.url).toMatch(/^\/uploads\/proof\/[a-f0-9]{24}$/);
  expect(JSON.stringify(result.body)).not.toContain('cloudinary');
  expect(uploadStream.mock.calls[0][0]).toMatchObject({
    type: 'authenticated',
    format: 'webp',
    folder: 'replate-proof',
  });
  const record = await ProofUpload.findOne({ owner: owner._id });
  expect(record.publicId).toBe('replate-proof/random');
  const photo = await request(app)
    .post('/api/v1/uploads')
    .set('Authorization', auth(owner))
    .attach('file', png, 'food.png');
  expect(photo.status).toBe(201);
  expect(uploadStream.mock.calls[1][0].type).toBeUndefined();
});
it('rejects unsigned, unauthorized role, fake MIME and oversize uploads before storage', async () => {
  expect(
    (
      await request(app)
        .post('/api/v1/uploads/proof')
        .attach('file', png, 'proof.png')
    ).status,
  ).toBe(401);
  expect(
    (
      await request(app)
        .post('/api/v1/uploads/proof')
        .set('Authorization', auth(admin))
        .attach('file', png, 'proof.png')
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .post('/api/v1/uploads/proof')
        .set('Authorization', auth(owner))
        .attach('file', Buffer.from('<svg>bad</svg>'), {
          filename: 'fake.png',
          contentType: 'image/png',
        })
    ).status,
  ).toBe(400);
  expect(
    (
      await request(app)
        .post('/api/v1/uploads/proof')
        .set('Authorization', auth(owner))
        .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), 'large.png')
    ).status,
  ).toBe(413);
  expect(uploadStream).not.toHaveBeenCalled();
});
it('owner and admin can read proof bytes; strangers and revoked records cannot, and origin is not disclosed', async () => {
  const record = await ProofUpload.create({
    owner: owner._id,
    publicId: 'replate-proof/read-test',
  });
  originUrl.mockReturnValue(
    'https://res.cloudinary.com/synthetic/image/authenticated/s--signed--/proof.webp',
  );
  const fetcher = vi
    .fn()
    .mockImplementation(async () => new Response(png, { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  const path = `/api/v1/uploads/proof/${record._id}`;
  expect((await request(app).get(path)).status).toBe(401);
  expect(
    (await request(app).get(path).set('Authorization', auth(stranger))).status,
  ).toBe(404);
  expect(fetcher).not.toHaveBeenCalled();
  for (const user of [owner, admin]) {
    const r = await request(app).get(path).set('Authorization', auth(user));
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(r.headers['content-type']).toContain('image/webp');
    expect(r.headers.location).toBeUndefined();
  }
  expect(originUrl.mock.calls[0][1]).toMatchObject({
    type: 'authenticated',
    sign_url: true,
  });
  await ProofUpload.updateOne({ _id: record._id }, { $set: { revoked: true } });
  expect(
    (await request(app).get(path).set('Authorization', auth(owner))).status,
  ).toBe(404);
});
it('cannot bind another owners private proof and allows own proof for admin review', async () => {
  const record = await ProofUpload.create({
    owner: owner._id,
    publicId: 'replate-proof/bind',
  });
  const data = {
    name: 'Test kitchen',
    registrationNo: 'REG123',
    timezone: 'Asia/Kolkata',
    address: '123 Example Street',
    location: { type: 'Point', coordinates: [77, 12] },
    verificationDocs: [`/uploads/proof/${record._id}`],
  };
  expect(
    (
      await request(app)
        .post('/api/v1/organizations')
        .set('Authorization', auth(stranger))
        .send(data)
    ).status,
  ).toBe(400);
  const own = await request(app)
    .post('/api/v1/organizations')
    .set('Authorization', auth(owner))
    .send(data);
  expect(own.status).toBe(201);
  expect(
    (await Organization.findById(own.body.data._id)).verificationStatus,
  ).toBe('pending');
});
