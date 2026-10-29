import os from 'node:os';
import { fork } from 'node:child_process';
// Disposable local load test. Never points at or modifies a production database.
import autocannon from 'autocannon';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { writeFile, mkdir } from 'node:fs/promises';
import { parseEnv } from '../../server/src/config/env.js';
import { User } from '../../server/src/models/User.js';
import { Organization } from '../../server/src/models/Organization.js';
import { FoodListing } from '../../server/src/models/FoodListing.js';
import { Claim } from '../../server/src/models/Claim.js';
import { signAccess } from '../../server/src/lib/tokens.js';
const connections = Number(process.env.LOAD_CONNECTIONS || 200);
const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
// Report actual disposable storage/durability settings, never alter them to pass.

let server;
try {
  await mongoose.connect(mongo.getUri(), { maxPoolSize: 250, minPoolSize: 20 });
  if (process.env.PROFILE_DB === '1') {
    const admin = mongoose.connection.db.admin();
    const [status, options, defaults] = await Promise.all([
      admin.command({ serverStatus: 1 }),
      admin.command({ getCmdLineOpts: 1 }),
      admin.command({ getDefaultRWConcern: 1 }),
    ]);
    console.error(
      'Disposable storage diagnostic',
      JSON.stringify({
        engine: status.storageEngine,
        journaling: options.parsed?.storage?.journal,
        writeConcern: defaults.defaultWriteConcern || 'server default',
        filesystem: os.tmpdir(),
      }),
    );
  }
  await Promise.all([
    User.init(),
    Organization.init(),
    FoodListing.init(),
    Claim.init(),
  ]);
  const config = parseEnv({
    NODE_ENV: 'test',
    CLIENT_URL: 'http://localhost:5173',
    MONGODB_URI: mongo.getUri(),
    JWT_ACCESS_SECRET: 'a'.repeat(48),
    JWT_REFRESH_SECRET: 'b'.repeat(48),
    RATE_LIMIT_MAX: 1000000,
  });
  const [r, n] = await User.create(
    ['restaurant', 'ngo'].map((role) => ({
      name: 'Load ' + role,
      email: role + '@load.example',
      role,
      passwordHash: 'unused',
      isEmailVerified: true,
      verificationStatus: 'approved',
    })),
  );
  const [restaurant] = await Organization.create(
    [r, n].map((u) => ({
      owner: u._id,
      type: u.role,
      name: 'Load org',
      registrationNo: 'LOAD123',
      address: '123 Test Road',
      timezone: 'Asia/Kolkata',
      location: { type: 'Point', coordinates: [77.59, 12.97] },
      verificationDocs: ['https://example.com/proof'],
      verificationStatus: 'approved',
    })),
  );
  const extraUsers = await User.insertMany(
    Array.from({ length: 199 }, (_, i) => ({
      name: 'Load NGO ' + i,
      email: `ngo${i}@load.example`,
      role: 'ngo',
      passwordHash: 'unused',
      isEmailVerified: true,
      verificationStatus: 'approved',
    })),
  );
  await Organization.insertMany(
    extraUsers.map((u) => ({
      owner: u._id,
      type: 'ngo',
      name: 'Load NGO',
      registrationNo: 'LOAD123',
      address: '123 Test Road',
      timezone: 'Asia/Kolkata',
      location: { type: 'Point', coordinates: [77.59, 12.97] },
      verificationDocs: ['https://example.com/proof'],
      verificationStatus: 'approved',
    })),
  );
  const claimUsers = [n, ...extraUsers];
  const claimTokens = claimUsers.map((user) => signAccess(user, config));
  const now = Date.now();
  const docs = await FoodListing.insertMany(
    Array.from({ length: 200 }, (_, i) => ({
      restaurant: restaurant._id,
      title: 'Load bread ' + i,
      description: 'Disposable load fixture',
      category: 'bakery',
      quantity: 10,
      unit: 'items',
      servings: 10,
      preparedAt: new Date(now - 3600000),
      bestBefore: new Date(now + 7200000),
      pickupWindow: { start: new Date(now), end: new Date(now + 3600000) },
      location: restaurant.location,
    })),
  );
  server = fork(new URL('./load-server.mjs', import.meta.url), [], {
    env: {
      ...process.env,
      ...Object.fromEntries(
        Object.entries(config).map(([k, v]) => [k, String(v)]),
      ),
    },
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  const { port } = await new Promise((resolve, reject) => {
    server.once('message', resolve);
    server.once('error', reject);
  });
  const url = 'http://localhost:' + port;
  const run = (options) =>
    new Promise((resolve, reject) => {
      const times = [];
      const instance = autocannon(options, (e, r) => {
        if (e) return reject(e);
        times.sort((a, b) => a - b);
        r.measuredP95 = times[Math.ceil(times.length * 0.95) - 1];
        resolve(r);
      });
      instance.on('response', (_client, _status, _bytes, ms) => times.push(ms));
    });
  const search = await run({
    url: url + '/api/v1/listings?lat=12.97&lng=77.59&limit=20',
    connections,
    duration: 10,
  });
  // Each request claims its own listing. A separate same-listing race is checked by integration tests.
  let next = 0;
  await Promise.all(
    Array.from({ length: 200 }, () =>
      mongoose.connection.db.command({ ping: 1 }),
    ),
  );
  // Establish the already-used API connection pool before the measured mutation burst.
  await fetch(url + '/api/v1/claims/mine', {
    headers: { authorization: 'Bearer ' + signAccess(n, config) },
  });
  const claim = await run({
    url,
    connections,
    amount: 200,
    requests: [
      {
        method: 'POST',
        path: '/api/v1/claims',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + signAccess(n, config),
        },
        setupRequest: (request) => {
          const token = claimTokens[next];
          const listing = docs[next++];
          if (!listing) return null;
          request.headers = {
            ...request.headers,
            authorization: 'Bearer ' + token,
          };
          request.body = JSON.stringify({ listingId: String(listing._id) });
          return request;
        },
      },
    ],
  });
  function summary(r) {
    return {
      connections,
      requests: r.requests.total,
      p95Ms: r.measuredP95,
      p50Ms: r.latency.p50,
      p99Ms: r.latency.p99,
      errors: r.errors,
      timeouts: r.timeouts,
      non2xx: r.non2xx,
      errorRate: (r.errors + r.non2xx) / (r.requests.total || 1),
      statuses: r.statusCodeStats,
    };
  }
  const output = {
    measuredAt: new Date().toISOString(),
    topology: {
      cpuCores: os.cpus().length,
      memoryBytes: os.totalmem(),
      platform: os.platform(),
      release: os.release(),
    },
    environment:
      'Disposable single-node Mongo replica set; API and load generator in separate processes; Node ' +
      process.version,
    search: summary(search),
    claim: summary(claim),
    persistedClaims: await Claim.countDocuments(),
    distinctClaimingNgos: (await Claim.distinct('ngo')).length,
    reservedListings: await FoodListing.countDocuments({ status: 'reserved' }),
  };
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/load.json', JSON.stringify(output, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY)
    await writeFile(
      process.env.GITHUB_STEP_SUMMARY,
      `### 200-connection load evidence\n\nSearch p95: ${output.search.p95Ms.toFixed(2)}ms. Claim p95: ${output.claim.p95Ms.toFixed(2)}ms. Persisted claims: ${output.persistedClaims}. Errors: ${output.search.errors + output.claim.errors}.\n\nLatency target: below 300ms. This job enforces both latency and correctness; a missed target fails the job.\n`,
      { flag: 'a' },
    );
  console.log(JSON.stringify(output, null, 2));
  if ((await Claim.distinct('ngo')).length !== 200)
    throw new Error('Distinct-user workload was not preserved');
  if ((await Claim.countDocuments()) !== 200)
    throw new Error('Distinct-listing load fixture failed');
  if (search.errors || search.non2xx || claim.errors || claim.non2xx)
    throw new Error('Unexpected load response failures');
  if (output.reservedListings !== 200)
    throw new Error('Reservation count mismatch');
  if (!(output.search.p95Ms < 300 && output.claim.p95Ms < 300))
    throw new Error('API p95 must stay below 300ms at 200 connections');
} finally {
  if (server) {
    server.send('stop');
    await new Promise((r) => server.once('exit', r));
  }
  await mongoose.disconnect();
  await mongo.stop();
}
