import { clearCache } from './services/cache.js';
import { recommendations, notifyMatches } from './services/matching.js';
import { SurplusHistory } from './models/SurplusHistory.js';
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
import { createClaim } from './services/claims.js';
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
const callRoute = (method, path) => request(app)[method]('/api/v1' + path);
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
    timezone: 'Asia/Kolkata',
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
  clearCache();
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
      (await SurplusHistory.findOne({ listing: listing._id })).quantityClaimed,
    ).toBe(10);
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
  it('reports only completed impact and protects notifications/admin routes', async () => {
    await post();
    const empty = await request(app).get('/api/v1/analytics/public');
    expect(empty.body.data.mealsSaved).toBe(0);
    await FoodListing.updateMany(
      {},
      { $set: { status: 'picked_up', unit: 'kg', quantity: 2 } },
    );
    clearCache();
    const impact = await request(app).get('/api/v1/analytics/public');
    expect(impact.body.data.mealsSaved).toBe(10);
    expect(impact.body.data.kgSaved).toBe(2);
    const n = await Notification.create({
      user: ngo.user._id,
      type: 'test',
      message: 'Private',
    });
    expect((await request(app).get('/api/v1/notifications')).status).toBe(401);
    expect(
      (
        await request(app)
          .patch(`/api/v1/notifications/${n._id}/read`)
          .set('Authorization', ngo2.auth)
          .send({})
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .patch(`/api/v1/notifications/${n._id}/read`)
          .set('Authorization', ngo.auth)
          .send({})
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .get('/api/v1/analytics/admin')
          .set('Authorization', ngo.auth)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get('/api/v1/admin/users')
          .set('Authorization', ngo.auth)
      ).status,
    ).toBe(403);
  });
  it('cannot disable any admin, including self or the last other admin', async () => {
    await User.updateOne(
      { _id: restaurant.user._id },
      { $set: { role: 'admin' } },
    );
    const other = await User.create({
      name: 'Other Admin',
      email: 'other-admin@example.com',
      role: 'admin',
      passwordHash: 'unused',
    });
    expect(
      (
        await request(app)
          .patch(`/api/v1/admin/users/${restaurant.user._id}`)
          .set('Authorization', restaurant.auth)
          .send({ disabled: true })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .patch(`/api/v1/admin/users/${other._id}`)
          .set('Authorization', restaurant.auth)
          .send({ disabled: true })
      ).status,
    ).toBe(403);
    expect((await User.findById(other._id)).deletedAt).toBeUndefined();
  });
  it('covers protected reads, strict validation, role denials and admin mutation success', async () => {
    const listing = await post();
    const admin = await User.create({
      name: 'Admin',
      email: 'admin-matrix@example.com',
      role: 'admin',
      passwordHash: 'unused',
      isEmailVerified: true,
      verificationStatus: 'approved',
    });
    const adminAuth = `Bearer ${signAccess(admin, config)}`;
    const paths = [
      '/organizations/mine',
      '/organizations',
      '/organizations/' + restaurant.org._id,
      '/listings/mine',
      '/claims/mine',
      '/analytics/restaurant',
      '/analytics/ngo',
      '/analytics/admin',
      '/notifications',
      '/admin/users',
      '/admin/audit',
      '/ai/forecast',
      '/ai/recommendations/' + listing._id,
    ];
    for (const path of paths)
      expect(
        (await request(app).get('/api/v1' + path)).status,
        `GET ${path} unauthenticated`,
      ).toBe(401);
    for (const [path, auth] of [
      ['/organizations', adminAuth],
      ['/organizations/mine', restaurant.auth],
      ['/organizations/' + restaurant.org._id, restaurant.auth],
      ['/listings/mine', restaurant.auth],
      ['/claims/mine', ngo.auth],
      ['/analytics/restaurant', restaurant.auth],
      ['/analytics/ngo', ngo.auth],
      ['/analytics/admin', adminAuth],
      ['/notifications', ngo.auth],
      ['/admin/users', adminAuth],
      ['/admin/audit', adminAuth],
      ['/ai/forecast', restaurant.auth],
      ['/ai/recommendations/' + listing._id, restaurant.auth],
    ]) {
      expect(
        (
          await request(app)
            .get('/api/v1' + path)
            .set('Authorization', auth)
        ).status,
        `GET ${path} success`,
      ).toBe(200);
    }
    for (const path of [
      '/organizations/mine',
      '/listings/mine',
      '/claims/mine',
      '/notifications',
      '/admin/users',
      '/admin/audit',
      '/analytics/admin',
      '/ai/forecast',
    ])
      expect(
        (
          await request(app)
            .get('/api/v1' + path + '?unexpected=value')
            .set(
              'Authorization',
              path.startsWith('/admin') || path === '/analytics/admin'
                ? adminAuth
                : restaurant.auth,
            )
        ).status,
        `GET ${path} validation`,
      ).toBe(400);
    for (const [method, path] of [
      ['post', '/organizations'],
      ['patch', '/organizations/' + restaurant.org._id],
      ['post', '/organizations/' + restaurant.org._id + '/verify'],
      ['patch', '/listings/' + listing._id],
      ['delete', '/listings/' + listing._id],
      ['post', '/claims'],
      ['post', '/claims/507f1f77bcf86cd799439011/approve'],
      ['post', '/claims/507f1f77bcf86cd799439011/feedback'],
      ['post', '/uploads'],
      ['post', '/ai/parse-listing'],
      ['patch', '/notifications/507f1f77bcf86cd799439011/read'],
      ['patch', '/admin/users/' + ngo.user._id],
      ['post', '/admin/listings/' + listing._id + '/moderate'],
    ])
      expect(
        (await callRoute(method, path).send({})).status,
        `${method} ${path} unauthenticated`,
      ).toBe(401);
    expect(
      (
        await request(app)
          .get('/api/v1/organizations/' + restaurant.org._id)
          .set('Authorization', ngo.auth)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get('/api/v1/organizations/' + restaurant.org._id + '?extra=1')
          .set('Authorization', restaurant.auth)
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .patch('/api/v1/listings/' + listing._id)
          .set('Authorization', restaurant.auth)
          .send(food())
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .patch('/api/v1/listings/' + listing._id)
          .set('Authorization', ngo.auth)
          .send(food())
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch('/api/v1/listings/' + listing._id)
          .set('Authorization', restaurant.auth)
          .send({})
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .delete('/api/v1/listings/' + listing._id)
          .set('Authorization', restaurant.auth)
          .send({ extra: true })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .delete('/api/v1/listings/' + listing._id)
          .set('Authorization', ngo.auth)
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/v1/claims')
          .set('Authorization', restaurant.auth)
          .send({ listingId: listing._id })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/v1/claims')
          .set('Authorization', ngo.auth)
          .send({ listingId: 'bad' })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/v1/ai/parse-listing')
          .set('Authorization', restaurant.auth)
          .send({})
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/v1/ai/parse-listing')
          .set('Authorization', ngo.auth)
          .send({ note: 'Bread' })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get('/api/v1/ai/forecast')
          .set('Authorization', ngo.auth)
      ).status,
    ).toBe(403);
    for (const data of [{ disabled: 'yes' }, { disabled: true, role: 'admin' }])
      expect(
        (
          await request(app)
            .patch('/api/v1/admin/users/' + ngo.user._id)
            .set('Authorization', adminAuth)
            .send(data)
        ).status,
      ).toBe(400);
    expect(
      (
        await request(app)
          .patch('/api/v1/admin/users/' + ngo.user._id)
          .set('Authorization', adminAuth)
          .send({ disabled: true })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .get('/api/v1/claims/mine')
          .set('Authorization', ngo.auth)
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .patch('/api/v1/admin/users/' + ngo.user._id)
          .set('Authorization', adminAuth)
          .send({ disabled: false })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post('/api/v1/admin/listings/' + listing._id + '/moderate')
          .set('Authorization', adminAuth)
          .send({ reason: 'Unsafe food' })
      ).status,
    ).toBe(200);
    expect((await FoodListing.findById(listing._id)).status).toBe('cancelled');
    expect(
      (await request(app).get('/api/v1/listings/' + listing._id)).status,
    ).toBe(200);
    expect(
      (await request(app).get('/api/v1/listings/nearby?lat=12.97&lng=77.59'))
        .status,
    ).toBe(200);
    const another = await post();
    expect(
      (
        await request(app)
          .delete('/api/v1/listings/' + another._id)
          .set('Authorization', restaurant.auth)
          .send({})
      ).status,
    ).toBe(200);
  });
  it('covers reject/no-show transitions, strict action inputs and feedback denials', async () => {
    const listing = await post();
    const c = (
      await request(app)
        .post('/api/v1/claims')
        .set('Authorization', ngo.auth)
        .send({ listingId: listing._id })
    ).body.data;
    expect(
      (
        await request(app)
          .post(`/api/v1/claims/${c._id}/approve`)
          .set('Authorization', restaurant.auth)
          .send({ extra: true })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/v1/claims/${c._id}/feedback`)
          .set('Authorization', ngo.auth)
          .send({ rating: 6 })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/v1/claims/${c._id}/feedback`)
          .set('Authorization', ngo.auth)
          .send({ rating: 5 })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .post(`/api/v1/claims/${c._id}/reject`)
          .set('Authorization', restaurant.auth)
          .send({})
      ).status,
    ).toBe(200);
    const d = (
      await request(app)
        .post('/api/v1/claims')
        .set('Authorization', ngo.auth)
        .send({ listingId: listing._id })
    ).body.data;
    expect(
      (
        await request(app)
          .post(`/api/v1/claims/${d._id}/no-show`)
          .set('Authorization', restaurant.auth)
          .send({})
      ).status,
    ).toBe(200);
    expect(canTransition('unknown', 'approved')).toBe(false);
  });
  it('subtracts allocated capacity on each NGO local day, not a UTC day', async () => {
    const instant = new Date('2026-10-29T00:30:00+05:30');
    const listing = await FoodListing.create({
      ...food(),
      restaurant: restaurant.org._id,
      bestBefore: new Date(instant.getTime() + 7200000),
      pickupWindow: {
        start: instant,
        end: new Date(instant.getTime() + 3600000),
      },
    });
    await Claim.create({
      listing: listing._id,
      ngo: ngo.org._id,
      restaurant: restaurant.org._id,
      status: 'picked_up',
      createdAt: new Date('2026-10-28T23:00:00+05:30'),
    });
    await Organization.updateOne(
      { _id: ngo.org._id },
      { $set: { capacity: 10 } },
    );
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(instant);
    try {
      const matches = await recommendations(listing);
      expect(matches.some((x) => String(x._id) === String(ngo.org._id))).toBe(
        true,
      );
    } finally {
      vi.useRealTimers();
    }
  });
  it('validates notification/admin writes and denies crossed roles', async () => {
    const admin = await User.create({
      name: 'Admin',
      email: 'admin-validation@example.com',
      role: 'admin',
      passwordHash: 'unused',
    });
    const auth = `Bearer ${signAccess(admin, config)}`;
    const listing = await post();
    const notification = await Notification.create({
      user: ngo.user._id,
      type: 'test',
      message: 'Private',
    });
    expect(
      (
        await request(app)
          .patch(`/api/v1/notifications/${notification._id}/read`)
          .set('Authorization', ngo.auth)
          .send({ extra: 1 })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .get('/api/v1/notifications')
          .set('Authorization', ngo2.auth)
      ).body.data.items.some((item) => item._id === String(notification._id)),
    ).toBe(false);
    for (const body of [{ reason: 'x' }, { reason: 'Valid', extra: 1 }])
      expect(
        (
          await request(app)
            .post(`/api/v1/admin/listings/${listing._id}/moderate`)
            .set('Authorization', auth)
            .send(body)
        ).status,
      ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/v1/admin/listings/${listing._id}/moderate`)
          .set('Authorization', ngo.auth)
          .send({ reason: 'Valid' })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch(`/api/v1/admin/users/${ngo.user._id}`)
          .set('Authorization', restaurant.auth)
          .send({ disabled: true })
      ).status,
    ).toBe(403);
    for (const [path, token] of [
      ['restaurant', ngo.auth],
      ['ngo', restaurant.auth],
    ])
      expect(
        (
          await request(app)
            .get('/api/v1/analytics/' + path)
            .set('Authorization', token)
        ).status,
      ).toBe(403);
    expect(
      (await request(app).get('/api/v1/analytics/public?extra=1')).status,
    ).toBe(400);
    expect((await request(app).get('/api/v1/listings/invalid')).status).toBe(
      400,
    );
    expect(
      (
        await request(app)
          .post('/api/v1/uploads')
          .set('Authorization', restaurant.auth)
      ).status,
    ).toBe(400);
  });
  it('rolls back listing post and expiry if related history/claim writes fail', async () => {
    const history = vi
      .spyOn(SurplusHistory, 'create')
      .mockRejectedValueOnce(new Error('history failed'));
    const failed = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', restaurant.auth)
      .send(food());
    history.mockRestore();
    expect(failed.status).toBe(500);
    expect(await FoodListing.countDocuments()).toBe(0);
    const listing = await post();
    expect(
      (await SurplusHistory.findOne({ listing: listing._id })).quantityPosted,
    ).toBe(10);
    const c = (
      await request(app)
        .post('/api/v1/claims')
        .set('Authorization', ngo.auth)
        .send({ listingId: listing._id })
    ).body.data;
    await FoodListing.updateOne(
      { _id: listing._id },
      { $set: { bestBefore: new Date(0) } },
    );
    const update = vi
      .spyOn(Claim, 'updateOne')
      .mockRejectedValueOnce(new Error('expiry failed'));
    await expect(expireListings()).rejects.toThrow('expiry failed');
    update.mockRestore();
    expect((await FoodListing.findById(listing._id)).status).toBe('reserved');
    expect((await Claim.findById(c._id)).status).toBe('requested');
    expect(await expireListings()).toBe(1);
    expect((await Claim.findById(c._id)).status).toBe('no_show');
  });
  it('updates forecast history on listing edits without duplicate records', async () => {
    const listing = await post();
    const r = await request(app)
      .patch('/api/v1/listings/' + listing._id)
      .set('Authorization', restaurant.auth)
      .send({ ...food(), servings: 25, category: 'produce' });
    expect(r.status).toBe(200);
    const rows = await SurplusHistory.find({ listing: listing._id });
    expect(rows).toHaveLength(1);
    expect(rows[0].quantityPosted).toBe(25);
    expect(rows[0].category).toBe('produce');
  });
  it('microbatches distinct claims and races without duplicating reservations', async () => {
    const [a, b] = await FoodListing.insertMany(
      [1, 2].map(() => ({ ...food(), restaurant: restaurant.org._id })),
    );
    const results = await Promise.allSettled([
      createClaim(a._id, ngo.org),
      createClaim(a._id, ngo.org),
      createClaim(a._id, ngo2.org),
      createClaim(b._id, ngo2.org),
    ]);
    expect(results.map((x) => x.status)).toEqual([
      'fulfilled',
      'fulfilled',
      'rejected',
      'fulfilled',
    ]);
    expect(String(results[0].value._id)).toBe(String(results[1].value._id));
    expect(await Claim.countDocuments()).toBe(2);
    expect(await FoodListing.countDocuments({ status: 'reserved' })).toBe(2);
    expect(await Notification.countDocuments({ type: 'claim-request' })).toBe(
      2,
    );
  });
  it('rolls back an entire multi-listing batch if claim or notice persistence fails', async () => {
    const listings = await FoodListing.insertMany(
      [1, 2].map(() => ({ ...food(), restaurant: restaurant.org._id })),
    );
    for (const model of [Claim, Notification]) {
      const spy = vi
        .spyOn(model, 'insertMany')
        .mockRejectedValueOnce(new Error('batch failed'));
      const results = await Promise.allSettled(
        listings.map((x) => createClaim(x._id, ngo.org)),
      );
      spy.mockRestore();
      expect(results.every((x) => x.status === 'rejected')).toBe(true);
      expect(await Claim.countDocuments()).toBe(0);
      expect(await FoodListing.countDocuments({ status: 'available' })).toBe(2);
      expect(await Notification.countDocuments()).toBe(0);
    }
  });
  it('mixed batch errors do not reject unrelated valid claims or bypass deadlines', async () => {
    const listings = await FoodListing.insertMany(
      [1, 2].map(() => ({ ...food(), restaurant: restaurant.org._id })),
    );
    await FoodListing.updateOne(
      { _id: listings[0]._id },
      { $set: { bestBefore: new Date(0) } },
    );
    const results = await Promise.allSettled([
      createClaim(listings[0]._id, ngo.org),
      createClaim(listings[1]._id, ngo.org),
    ]);
    expect(results.map((x) => x.status)).toEqual(['rejected', 'fulfilled']);
    expect(await Claim.countDocuments()).toBe(1);
  });
  it('microbatch retries do not duplicate persisted notices and compare-swap failures roll back', async () => {
    const listings = await FoodListing.insertMany(
      [1, 2].map(() => ({ ...food(), restaurant: restaurant.org._id })),
    );
    await Promise.all(listings.map((x) => createClaim(x._id, ngo.org)));
    const count = await Notification.countDocuments({ type: 'claim-request' });
    await Promise.all(listings.map((x) => createClaim(x._id, ngo.org)));
    expect(await Notification.countDocuments({ type: 'claim-request' })).toBe(
      count,
    );
    await createClaim(listings[0]._id, ngo.org);
    expect(await Notification.countDocuments({ type: 'claim-request' })).toBe(
      count,
    );
    const fresh = await FoodListing.insertMany(
      [1, 2].map(() => ({ ...food(), restaurant: restaurant.org._id })),
    );
    const update = vi
      .spyOn(FoodListing, 'bulkWrite')
      .mockResolvedValueOnce({ matchedCount: 1 });
    const results = await Promise.allSettled(
      fresh.map((x) => createClaim(x._id, ngo.org)),
    );
    update.mockRestore();
    expect(results.every((x) => x.status === 'rejected')).toBe(true);
    expect(await Claim.countDocuments()).toBe(2);
    expect(await FoodListing.countDocuments({ status: 'available' })).toBe(2);
  });
  it('overlapping transaction batches cannot reserve one listing for different ngos', async () => {
    const listing = await post();
    const first = createClaim(listing._id, ngo.org);
    await new Promise((r) => setTimeout(r, 30));
    const second = createClaim(listing._id, ngo2.org);
    const results = await Promise.allSettled([first, second]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(await Claim.countDocuments()).toBe(1);
    expect(await Notification.countDocuments({ type: 'claim-request' })).toBe(
      1,
    );
  });
  it('microbatch-generated claims and notices preserve timestamps and valid pickup codes', async () => {
    const listings = await FoodListing.insertMany(
      [1, 2].map(() => ({ ...food(), restaurant: restaurant.org._id })),
    );
    await Promise.all(listings.map((x) => createClaim(x._id, ngo.org)));
    const claims = await Claim.find().select('+pickupCode');
    const notices = await Notification.find({ type: 'claim-request' });
    expect(
      claims.every(
        (x) => x.createdAt instanceof Date && /^\d{6}$/.test(x.pickupCode),
      ),
    ).toBe(true);
    expect(
      notices.every(
        (x) =>
          x._id &&
          x.createdAt instanceof Date &&
          String(x.user) === String(restaurant.user._id),
      ),
    ).toBe(true);
  });
  it('queued claims cannot bypass the live role and organization gates after revocation', async () => {
    const listing = await post();
    await User.updateOne(
      { _id: ngo.user._id },
      { $set: { verificationStatus: 'rejected' } },
    );
    expect(
      (
        await request(app)
          .post('/api/v1/claims')
          .set('Authorization', ngo.auth)
          .send({ listingId: listing._id })
      ).status,
    ).toBe(403);
    await User.updateOne(
      { _id: ngo.user._id },
      { $set: { verificationStatus: 'approved' } },
    );
    await Organization.updateOne(
      { _id: ngo.org._id },
      { $set: { verificationStatus: 'rejected' } },
    );
    expect(
      (
        await request(app)
          .post('/api/v1/claims')
          .set('Authorization', ngo.auth)
          .send({ listingId: listing._id })
      ).status,
    ).toBe(403);
    expect(await Claim.countDocuments()).toBe(0);
  });
});
