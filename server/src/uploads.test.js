import { beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { User } from './models/User.js';
import { ProofUpload, UploadBudget } from './models/ProofUpload.js';
import { signAccess } from './lib/tokens.js';
import { TOTAL_UPLOAD_BYTES } from './routes/uploads.js';
let mongo, owner, stranger, admin, png;
const config = parseEnv({
  NODE_ENV: 'test',
  CLIENT_URL: 'http://localhost:5173',
  MONGODB_URI: 'mongodb://localhost/test',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
  RATE_LIMIT_MAX: 10000,
});
const app = createApp(config);
const auth = (u) => `Bearer ${signAccess(u, config)}`;
const upload = (user, path = '/proof', bytes = png) =>
  request(app)
    .post('/api/v1/uploads' + path)
    .set('Authorization', auth(user))
    .attach('file', bytes, 'synthetic.png');
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
  png = await sharp({
    create: { width: 80, height: 50, channels: 3, background: '#aabbcc' },
  })
    .png()
    .toBuffer();
});
beforeEach(async () => {
  await ProofUpload.deleteMany({});
  await UploadBudget.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
it('stores reencoded bytes in existing database; proof private and public photos explicit', async () => {
  const proof = await upload(owner);
  expect(proof.status).toBe(201);
  expect(proof.body.data.url).toMatch(/^\/uploads\/proof\/[a-f0-9]{24}$/);
  const record = await ProofUpload.findOne({ owner: owner._id }).select(
    '+bytes',
  );
  expect((await sharp(record.bytes).metadata()).format).toBe('webp');
  expect(record.size).toBe(record.bytes.length);
  const path = '/api/v1' + proof.body.data.url;
  expect((await request(app).get(path)).status).toBe(401);
  expect(
    (await request(app).get(path).set('Authorization', auth(stranger))).status,
  ).toBe(404);
  for (const user of [owner, admin]) {
    const r = await request(app).get(path).set('Authorization', auth(user));
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(r.headers['content-type']).toContain('image/webp');
  }
  const photo = await upload(owner, '/');
  expect(photo.status).toBe(201);
  const publicPath = new URL(photo.body.data.url).pathname;
  expect((await request(app).get(publicPath)).status).toBe(200);
  expect(
    (
      await request(app)
        .get(publicPath.replace('/photo/', '/proof/'))
        .set('Authorization', auth(owner))
    ).status,
  ).toBe(404);
});
it('rejects noauth/admin/fakebytes/oversize/broken decoding before storing', async () => {
  expect(
    (
      await request(app)
        .post('/api/v1/uploads/proof')
        .attach('file', png, 'proof.png')
    ).status,
  ).toBe(401);
  expect((await upload(admin)).status).toBe(403);
  expect(
    (await upload(owner, '/proof', Buffer.from('<svg>bad</svg>'))).status,
  ).toBe(400);
  expect(
    (await upload(owner, '/proof', Buffer.alloc(5 * 1024 * 1024 + 1))).status,
  ).toBe(413);
  expect((await upload(owner, '/proof', png.subarray(0, 45))).status).toBe(400);
  expect(await ProofUpload.countDocuments()).toBe(0);
});
it('enforces atomic global quota during concurrent uploads and owner removal releases bytes', async () => {
  const size = (
    await sharp(png)
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 78 })
      .toBuffer()
  ).length;
  await UploadBudget.create({ _id: 'global', used: TOTAL_UPLOAD_BYTES - size });
  const results = await Promise.all([upload(owner), upload(stranger)]);
  expect(results.map((x) => x.status).sort()).toEqual([201, 409]);
  expect(await ProofUpload.countDocuments()).toBe(1);
  const record = await ProofUpload.findOne();
  const correct = String(record.owner) === String(owner._id) ? owner : stranger;
  const wrong = correct === owner ? stranger : owner;
  expect(
    (
      await request(app)
        .delete(`/api/v1/uploads/${record._id}`)
        .set('Authorization', auth(wrong))
    ).status,
  ).toBe(404);
  expect(
    (
      await request(app)
        .delete(`/api/v1/uploads/${record._id}`)
        .set('Authorization', auth(correct))
    ).status,
  ).toBe(200);
  expect((await UploadBudget.findById('global')).used).toBe(
    TOTAL_UPLOAD_BYTES - size,
  );
});
it('cannot bind another owners proof or a public photo as private proof', async () => {
  const proof = await upload(owner);
  const photo = await upload(owner, '/');
  const data = {
    name: 'Test kitchen',
    registrationNo: 'REG123',
    timezone: 'Asia/Kolkata',
    address: '123 Example Street',
    location: { type: 'Point', coordinates: [77, 12] },
    verificationDocs: [proof.body.data.url],
  };
  expect(
    (
      await request(app)
        .post('/api/v1/organizations')
        .set('Authorization', auth(stranger))
        .send(data)
    ).status,
  ).toBe(400);
  const photoId = new URL(photo.body.data.url).pathname.split('/').pop();
  expect(
    (
      await request(app)
        .post('/api/v1/organizations')
        .set('Authorization', auth(owner))
        .send({ ...data, verificationDocs: [`/uploads/proof/${photoId}`] })
    ).status,
  ).toBe(400);
  expect(
    (
      await request(app)
        .post('/api/v1/organizations')
        .set('Authorization', auth(owner))
        .send(data)
    ).status,
  ).toBe(201);
});

it('enforces per-owner object quota and foreign-owner deletion boundaries', async () => {
  const first = await upload(owner);
  const id = first.body.data.url.split('/').pop();
  expect(
    (
      await request(app)
        .delete('/api/v1/uploads/' + id)
        .set('Authorization', auth(stranger))
    ).status,
  ).toBe(404);
  await UploadBudget.updateOne(
    { _id: `owner:${owner._id}` },
    { $set: { count: 20 } },
  );
  expect((await upload(owner)).status).toBe(409);
  expect(await ProofUpload.countDocuments()).toBe(1);
});
