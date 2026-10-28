import { recommendations, notifyMatches } from './services/matching.js';
import { Notification } from './models/Notification.js';
// Verify geo queries, ownership, deadline gates and concurrent claim handover.
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { User } from './models/User.js';
import { Organization } from './models/Organization.js';
import { FoodListing } from './models/FoodListing.js';
import { Claim } from './models/Claim.js';
import { signAccess } from './lib/tokens.js';
import { expireListings } from './jobs/expiry.js';
import { canTransition } from './services/claims.js';
const config = parseEnv({
  NODE_ENV: 'test',
  CLIENT_URL: 'http://localhost:5173',
  MONGODB_URI: 'mongodb://localhost/test',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
  RATE_LIMIT_MAX: 10000,
});
const app = createApp(config);
let mongo;
let restaurant, ngo, ngo2;
async function actor(role, email) {
  const user = await User.create({
    name: 'Test User',
    email,
    passwordHash: 'not-used',
    role,
    isEmailVerified: true,
    verificationStatus: 'approved',
  });
  const org = await Organization.create({
    owner: user._id,
    type: role,
    name: 'Test Org',
    registrationNo: 'REG123',
    address: '123 Demo Street',
    location: { type: 'Point', coordinates: [77.59, 12.97] },
    verificationDocs: ['https://example.com/proof'],
    verificationStatus: 'approved',
  });
  return { user, org, auth: `Bearer ${signAccess(user, config)}` };
}
const food = () => ({
  title: 'Fresh bread',
  description: 'Sealed batch',
  category: 'bakery',
  dietary: ['veg'],
  quantity: 10,
  unit: 'items',
  servings: 10,
  photos: [],
  preparedAt: new Date(Date.now() - 3600000).toISOString(),
  bestBefore: new Date(Date.now() + 7200000).toISOString(),
  pickupWindow: {
    start: new Date().toISOString(),
    end: new Date(Date.now() + 3600000).toISOString(),
  },
  location: { type: 'Point', coordinates: [77.59, 12.97] },
});
async function post() {
  const r = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', restaurant.auth)
    .send(food());
  expect(r.status).toBe(201);
  return r.body.data;
}
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    User.init(),
    Organization.init(),
    FoodListing.init(),
    Claim.init(),
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
  restaurant = await actor('restaurant', 'restaurant@example.com');
  ngo = await actor('ngo', 'ngo@example.com');
  ngo2 = await actor('ngo', 'ngo2@example.com');
});
describe('core domain', () => {
  it('requires verified restaurant and strict future deadline', async () => {
    expect(
      (await request(app).post('/api/v1/listings').send(food())).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/listings')
          .set('Authorization', ngo.auth)
          .send(food())
      ).status,
    ).toBe(403);
    await User.updateOne(
      { _id: restaurant.user._id },
      { $set: { isEmailVerified: false } },
    );
    expect(
      (
        await request(app)
          .post('/api/v1/listings')
          .set('Authorization', restaurant.auth)
          .send(food())
      ).status,
    ).toBe(403);
    await User.updateOne(
      { _id: restaurant.user._id },
      { $set: { isEmailVerified: true } },
    );
    expect(
      (
        await request(app)
          .post('/api/v1/listings')
          .set('Authorization', restaurant.auth)
          .send({ ...food(), bestBefore: new Date(0).toISOString() })
      ).status,
    ).toBe(400);
  });
  it('searches geo/category with page limits and rejects operators', async () => {
    await post();
    const r = await request(app).get(
      '/api/v1/listings?lat=12.97&lng=77.59&category=bakery&limit=5',
    );
    expect(r.status).toBe(200);
    expect(r.body.data.items).toHaveLength(1);
    expect(r.body.data.items[0].distanceMeters).toBeLessThan(1);
    expect((await request(app).get('/api/v1/listings?lat=12')).status).toBe(
      400,
    );
    expect((await request(app).get('/api/v1/listings?limit=1000')).status).toBe(
      400,
    );
    expect(
      (await request(app).get('/api/v1/listings?category[$ne]=x')).status,
    ).toBe(400);
  });
  it('exactly one NGO wins a concurrent claim, then restaurant verifies code', async () => {
    const listing = await post();
    const results = await Promise.all(
      [ngo, ngo2].map((a) =>
        request(app)
          .post('/api/v1/claims')
          .set('Authorization', a.auth)
          .send({ listingId: listing._id }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await Claim.countDocuments()).toBe(1);
    const winner = results[0].status === 201 ? ngo : ngo2;
    const claim = results.find((r) => r.status === 201).body.data;
    expect(claim.pickupCode).toMatch(/^\d{6}$/);
    const repeat = await request(app)
      .post('/api/v1/claims')
      .set('Authorization', winner.auth)
      .send({ listingId: listing._id });
    expect(repeat.body.data._id).toBe(claim._id);
    expect(
      (
        await request(app)
          .post(`/api/v1/claims/${claim._id}/approve`)
          .set('Authorization', winner.auth)
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/v1/claims/${claim._id}/approve`)
          .set('Authorization', restaurant.auth)
          .send({})
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post(`/api/v1/claims/${claim._id}/confirm-pickup`)
          .set('Authorization', restaurant.auth)
          .send({ code: '000000' })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/v1/claims/${claim._id}/confirm-pickup`)
          .set('Authorization', restaurant.auth)
          .send({ code: claim.pickupCode })
      ).status,
    ).toBe(200);
    expect((await FoodListing.findById(listing._id)).status).toBe('picked_up');
    expect(
      (
        await request(app)
          .post(`/api/v1/claims/${claim._id}/feedback`)
          .set('Authorization', winner.auth)
          .send({ rating: 5, comment: 'Thank you' })
      ).status,
    ).toBe(201);
  });
  it('restricts edits and releases cancellation before expiry', async () => {
    const listing = await post();
    const c = await request(app)
      .post('/api/v1/claims')
      .set('Authorization', ngo.auth)
      .send({ listingId: listing._id });
    expect(
      (
        await request(app)
          .patch(`/api/v1/listings/${listing._id}`)
          .set('Authorization', restaurant.auth)
          .send(food())
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .post(`/api/v1/claims/${c.body.data._id}/cancel`)
          .set('Authorization', ngo2.auth)
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/v1/claims/${c.body.data._id}/cancel`)
          .set('Authorization', ngo.auth)
          .send({})
      ).status,
    ).toBe(200);
    expect((await FoodListing.findById(listing._id)).status).toBe('available');
  });
  it('expires reserved listings and prevents invalid transitions', async () => {
    const listing = await post();
    await request(app)
      .post('/api/v1/claims')
      .set('Authorization', ngo.auth)
      .send({ listingId: listing._id });
    await FoodListing.updateOne(
      { _id: listing._id },
      { $set: { bestBefore: new Date(0) } },
    );
    expect(await expireListings()).toBe(1);
    expect((await Claim.findOne()).status).toBe('no_show');
    expect(canTransition('picked_up', 'cancelled')).toBe(false);
    expect(canTransition('requested', 'approved')).toBe(true);
  });
  it('rejects fake image bytes and uses explicit no-key upload fallback', async () => {
    expect(
      (
        await request(app)
          .post('/api/v1/uploads')
          .set('Authorization', restaurant.auth)
          .attach('file', Buffer.from('<svg>bad</svg>'), 'food.jpg')
      ).status,
    ).toBe(400);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYQAAAABJRU5ErkJggg==',
      'base64',
    );
    expect(
      (
        await request(app)
          .post('/api/v1/uploads')
          .set('Authorization', restaurant.auth)
          .attach('file', png, 'food.png')
      ).status,
    ).toBe(503);
  });
  it('rolls back reservation when claim persistence fails', async () => {
    const listing = await post();
    const spy = vi
      .spyOn(Claim, 'create')
      .mockRejectedValueOnce(new Error('Injected persistence failure'));
    const r = await request(app)
      .post('/api/v1/claims')
      .set('Authorization', ngo.auth)
      .send({ listingId: listing._id });
    spy.mockRestore();
    expect(r.status).toBe(500);
    expect((await FoodListing.findById(listing._id)).status).toBe('available');
    expect(await Claim.countDocuments()).toBe(0);
  });
  it('rolls back pickup if listing update fails and prevents duplicate completion', async () => {
    const listing = await post();
    const c = await request(app)
      .post('/api/v1/claims')
      .set('Authorization', ngo.auth)
      .send({ listingId: listing._id });
    await request(app)
      .post(`/api/v1/claims/${c.body.data._id}/approve`)
      .set('Authorization', restaurant.auth)
      .send({});
    const spy = vi
      .spyOn(FoodListing, 'updateOne')
      .mockRejectedValueOnce(new Error('Injected listing failure'));
    const failed = await request(app)
      .post(`/api/v1/claims/${c.body.data._id}/confirm-pickup`)
      .set('Authorization', restaurant.auth)
      .send({ code: c.body.data.pickupCode });
    spy.mockRestore();
    expect(failed.status).toBe(500);
    expect((await Claim.findById(c.body.data._id)).status).toBe('approved');
    expect((await FoodListing.findById(listing._id)).status).toBe('reserved');
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app)
          .post(`/api/v1/claims/${c.body.data._id}/confirm-pickup`)
          .set('Authorization', restaurant.auth)
          .send({ code: c.body.data.pickupCode }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });
  it('ranks geo candidates and notifies each NGO at most once', async () => {
    const listing = await FoodListing.create({
      ...food(),
      restaurant: restaurant.org._id,
    });
    const matches = await recommendations(listing);
    expect(matches).toHaveLength(2);
    expect(matches.every((x) => x.score > 0 && x.breakdown.pickup === 1)).toBe(
      true,
    );
    expect(await notifyMatches(listing._id)).toBe(2);
    expect(await notifyMatches(listing._id)).toBe(0);
    expect(await Notification.countDocuments()).toBe(2);
    expect(
      (
        await request(app)
          .get(`/api/v1/ai/recommendations/${listing._id}`)
          .set('Authorization', ngo.auth)
      ).status,
    ).toBe(403);
    const parsed = await request(app)
      .post('/api/v1/ai/parse-listing')
      .set('Authorization', restaurant.auth)
      .send({ note: 'Bread' });
    expect(parsed.status).toBe(200);
    expect(parsed.body.data.mode).toBe('manual');
  });
});
