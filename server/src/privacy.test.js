import { Feedback } from './models/Feedback.js';
import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { deleteAccount } from './services/privacy.js';
import { User } from './models/User.js';
import { Organization } from './models/Organization.js';
import { FoodListing } from './models/FoodListing.js';
import { Claim } from './models/Claim.js';
import { Notification } from './models/Notification.js';
import { ActionToken } from './models/ActionToken.js';
import { RefreshToken } from './models/RefreshToken.js';
import { signAccess, signRefresh, digest } from './lib/tokens.js';
const config = parseEnv({
  NODE_ENV: 'test',
  CLIENT_URL: 'http://localhost:5173',
  MONGODB_URI: 'mongodb://localhost/test',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
  RATE_LIMIT_MAX: 10000,
});
const app = createApp(config);
let mongo, user, org, token;
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})),
  );
  user = await User.create({
    name: 'Personal name',
    email: 'private@example.com',
    passwordHash: await bcrypt.hash('StrongPass123!', 12),
    role: 'restaurant',
    isEmailVerified: true,
    verificationStatus: 'approved',
    phone: '123',
  });
  org = await Organization.create({
    owner: user._id,
    type: 'restaurant',
    name: 'Personal kitchen',
    registrationNo: 'PRIVATE',
    timezone: 'Asia/Kolkata',
    address: 'Private address',
    location: { type: 'Point', coordinates: [77, 12] },
    verificationDocs: ['https://example.com/private'],
    verificationStatus: 'approved',
  });
  token = signAccess(user, config);
});
it('requires authentication, strict confirmation and current password', async () => {
  expect((await request(app).delete('/api/v1/auth/me').send({})).status).toBe(
    401,
  );
  expect(
    (
      await request(app)
        .delete('/api/v1/auth/me')
        .set('Authorization', 'Bearer ' + token)
        .send({ confirmation: 'DELETE' })
    ).status,
  ).toBe(400);
  expect(
    (
      await request(app)
        .delete('/api/v1/auth/me')
        .set('Authorization', 'Bearer ' + token)
        .send({ password: 'wrong', confirmation: 'DELETE' })
    ).status,
  ).toBe(401);
});
it('erases PII/tokens/notifications, cancels available listings and denies old sessions', async () => {
  const refresh = signRefresh(user, 'family', config);
  await RefreshToken.create({
    user: user._id,
    tokenHash: digest(refresh),
    family: 'family',
    expiresAt: new Date(Date.now() + 100000),
  });
  await ActionToken.create({
    user: user._id,
    type: 'verify',
    tokenHash: 'test',
    expiresAt: new Date(Date.now() + 100000),
  });
  await Notification.create({
    user: user._id,
    type: 'test',
    message: 'private',
  });
  const listing = await FoodListing.create({
    restaurant: org._id,
    title: 'Personal title',
    description: 'private',
    category: 'bakery',
    quantity: 1,
    unit: 'items',
    servings: 1,
    bestBefore: new Date(Date.now() + 100000),
    location: org.location,
    photos: ['https://example.com/private'],
  });
  await Feedback.create({
    claim: new mongoose.Types.ObjectId(),
    from: user._id,
    to: org._id,
    rating: 4,
    comment: 'Personal details',
  });
  const r = await request(app)
    .delete('/api/v1/auth/me')
    .set('Authorization', 'Bearer ' + token)
    .send({ password: 'StrongPass123!', confirmation: 'DELETE' });
  expect(r.status).toBe(200);
  expect(r.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');
  const erased = await User.findById(user._id).select('+passwordHash');
  expect(erased.email).not.toBe(user.email);
  expect(erased.name).toBe('Deleted account');
  expect(erased.phone).toBe('');
  expect(erased.passwordHash).toBe('deleted');
  const erasedOrg = await Organization.findById(org._id);
  expect(erasedOrg.verificationDocs).toHaveLength(0);
  expect(erasedOrg.address).toBe('deleted');
  expect(erasedOrg.location.coordinates).toEqual([0, 0]);
  const food = await FoodListing.findById(listing._id);
  expect(food.status).toBe('cancelled');
  expect(food.photos).toHaveLength(0);
  expect(food.description).toBe('');
  expect((await Feedback.findOne()).comment).toBeUndefined();
  expect(await Notification.countDocuments()).toBe(0);
  expect(await ActionToken.countDocuments()).toBe(0);
  expect(await RefreshToken.countDocuments()).toBe(0);
  expect(
    (
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer ' + token)
    ).status,
  ).toBe(401);
  expect(
    (
      await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', 'refreshToken=' + refresh)
        .send({})
    ).status,
  ).toBe(401);
});
it('blocks active handovers and admin deletion, rolls back storage failure', async () => {
  await Claim.create({
    listing: new mongoose.Types.ObjectId(),
    ngo: new mongoose.Types.ObjectId(),
    restaurant: org._id,
    pickupCode: '123456',
    status: 'requested',
  });
  await expect(deleteAccount(user)).rejects.toThrow(/handovers/);
  expect((await User.findById(user._id)).deletedAt).toBeUndefined();
  await Claim.deleteMany({});
  await expect(
    deleteAccount({ ...user.toObject(), role: 'admin' }),
  ).rejects.toThrow(/administrator transfer/);
  const spy = vi
    .spyOn(Notification, 'deleteMany')
    .mockRejectedValueOnce(new Error('Injected privacy write failure'));
  await expect(deleteAccount(user)).rejects.toThrow(/Injected/);
  spy.mockRestore();
  expect((await User.findById(user._id)).email).toBe(user.email);
  expect((await Organization.findById(org._id)).name).toBe('Personal kitchen');
});
it('locks CORS and production HTTPS before requests reach routes', async () => {
  expect(
    (
      await request(app)
        .get('/api/v1/health')
        .set('Origin', 'https://evil.example')
    ).status,
  ).toBe(403);
  const production = createApp({
    ...config,
    NODE_ENV: 'production',
    CLIENT_URL: 'https://example.com',
  });
  expect((await request(production).get('/api/v1/health')).status).toBe(400);
  const r = await request(production)
    .get('/api/v1/health')
    .set('X-Forwarded-Proto', 'https')
    .set('Origin', 'https://example.com');
  expect(r.status).toBe(200);
  expect(r.headers['strict-transport-security']).toContain('max-age');
  expect(r.headers['content-security-policy']).toContain("default-src 'none'");
});
