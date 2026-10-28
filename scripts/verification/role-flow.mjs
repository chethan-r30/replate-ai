import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const root = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const { createApp } = await import(root + '/server/src/app.js');
const { parseEnv } = await import(root + '/server/src/config/env.js');
const { User } = await import(root + '/server/src/models/User.js');
const { Organization } = await import(
  root + '/server/src/models/Organization.js'
);
const { FoodListing } = await import(
  root + '/server/src/models/FoodListing.js'
);
const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
await mongoose.connect(mongo.getUri());
const config = parseEnv({
  NODE_ENV: 'test',
  CLIENT_URL: 'http://localhost:5173',
  MONGODB_URI: mongo.getUri(),
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
  RATE_LIMIT_MAX: 10000,
});
await mkdir(root + '/test-results', { recursive: true });
let server, browser, web;
try {
  const passwordHash = await bcrypt.hash('DemoVisual123!', 12);
  const users = await User.create(
    ['restaurant', 'ngo', 'admin'].map((role) => ({
      name: `Demo ${role}`,
      email: `${role}@demo.example`,
      passwordHash,
      role,
      isEmailVerified: true,
      verificationStatus: 'approved',
    })),
  );
  const orgs = await Organization.create(
    users.slice(0, 2).map((u) => ({
      owner: u._id,
      type: u.role,
      name: `Demo ${u.role}`,
      registrationNo: 'DEMO123',
      address: '123 Demo Street',
      timezone: 'Asia/Kolkata',
      location: { type: 'Point', coordinates: [77.59, 12.97] },
      verificationDocs: ['https://example.com/proof'],
      verificationStatus: 'approved',
      capacity: 100,
    })),
  );
  await FoodListing.create({
    restaurant: orgs[0]._id,
    title: 'Fresh bakery boxes',
    description: 'Demo listing for local visual verification only.',
    category: 'bakery',
    dietary: ['veg'],
    quantity: 20,
    unit: 'boxes',
    servings: 20,
    photos: [],
    preparedAt: new Date(Date.now() - 3600000),
    bestBefore: new Date(Date.now() + 7200000),
    pickupWindow: { start: new Date(), end: new Date(Date.now() + 3600000) },
    location: { type: 'Point', coordinates: [77.59, 12.97] },
  });
  server = createApp(config).listen(5000);
  web = spawn(
    'node',
    [
      '../node_modules/vite/bin/vite.js',
      '--host',
      '127.0.0.1',
      '--port',
      '5173',
    ],
    { cwd: root + '/client', stdio: 'ignore' },
  );
  for (let i = 0; i < 60; i++) {
    try {
      await fetch('http://localhost:5173');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const login = async (email) => {
    await page.goto('http://localhost:5173/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill('DemoVisual123!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('heading', { name: 'Hello, Demo.' }).waitFor();
  };
  await login('restaurant@demo.example');
  await page.getByRole('link', { name: 'Post surplus', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Smoke test bread');
  await page
    .getByLabel('Description', { exact: true })
    .fill('Local UI workflow smoke test');
  await page.getByLabel('Quantity', { exact: true }).fill('10');
  await page.getByLabel('Servings', { exact: true }).fill('10');
  const local = (d) =>
    new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await page
    .getByLabel('Prepared at', { exact: true })
    .fill(local(new Date(Date.now() - 3600000)));
  await page
    .getByLabel('Food deadline', { exact: true })
    .fill(local(new Date(Date.now() + 7200000)));
  await page
    .getByLabel('Pickup starts', { exact: true })
    .fill(local(new Date()));
  await page
    .getByLabel('Pickup ends', { exact: true })
    .fill(local(new Date(Date.now() + 3600000)));
  await page
    .getByRole('button', { name: 'Use organization coordinates' })
    .click();
  await page.getByRole('checkbox').check();
  await page
    .getByRole('button', { name: 'Review confirmed. Save listing' })
    .click();
  await page.getByRole('heading', { name: 'Your active table' }).waitFor();
  await page.getByRole('heading', { name: 'Smoke test bread' }).waitFor();
  console.log('Restaurant UI listing post passed');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await login('ngo@demo.example');
  await page
    .getByRole('link', { name: 'Explore food', exact: true })
    .last()
    .click();
  await page
    .getByRole('link', { name: 'Smoke test bread', exact: true })
    .click();
  await page.getByRole('button', { name: 'Request this food' }).click();
  await page.getByText('Status: requested', { exact: true }).waitFor();
  const code = (
    await page.locator('strong.tracking-widest').textContent()
  ).trim();
  await page.screenshot({
    path: root + '/test-results/replate-ngo-claim.png',
    fullPage: true,
  });
  console.log('NGO UI claim passed');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await login('restaurant@demo.example');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByLabel('NGO pickup code').fill(code);
  await page.getByRole('button', { name: 'Confirm handover' }).click();
  await page.getByText('Status: picked_up', { exact: true }).waitFor();
  if (
    (await page.getByRole('button', { name: 'View NGO matches' }).count()) > 1
  )
    throw new Error('Stale matching action on history');
  await page
    .getByRole('heading', { name: 'Listing history', exact: true })
    .waitFor();
  console.log('Restaurant UI verified pickup/history passed');
  await page.screenshot({
    path: root + '/test-results/replate-completed-pickup.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await login('admin@demo.example');
  await page.getByRole('heading', { name: 'Organization review' }).waitFor();
  const protectedAdmin = page.getByRole('button', {
    name: 'Protected admin',
    exact: true,
  });
  await protectedAdmin.waitFor();
  if (await protectedAdmin.isEnabled())
    throw new Error('Admin disable unexpectedly enabled');
  await page.screenshot({
    path: root + '/test-results/replate-admin.png',
    fullPage: true,
  });
  console.log('Admin UI dashboard passed');
  await page.close();
} finally {
  if (browser) await browser.close();
  if (web) {
    web.kill('SIGTERM');
    await new Promise((r) => web.on('close', r));
  }
  if (server) await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  await mongo.stop();
}
