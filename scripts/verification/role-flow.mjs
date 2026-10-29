import { strict as assert } from 'node:assert';
import { readDevInbox } from '../../server/src/lib/mail.js';
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
  await User.create({
    name: 'Demo admin',
    email: 'admin@demo.example',
    passwordHash,
    role: 'admin',
    isEmailVerified: true,
    verificationStatus: 'approved',
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
    permissions: ['geolocation'],
    geolocation: { latitude: 12.97, longitude: 77.59 },
    viewport: process.env.MOBILE
      ? { width: 390, height: 844 }
      : { width: 1280, height: 900 },
  });
  await page.goto('http://localhost:5173/listings');
  await page.context().clearPermissions();
  await page
    .getByRole('button', { name: 'Use my location', exact: true })
    .click();
  await page
    .getByText('We could not access your location.', { exact: false })
    .waitFor();
  await page
    .getByRole('button', { name: 'Use map center', exact: true })
    .click();
  await page
    .getByText('Location selected. Check or adjust the map pin.')
    .waitFor();
  await page.waitForFunction(() => {
    const tiles = [...document.querySelectorAll('.leaflet-tile')];
    return (
      tiles.length > 0 &&
      tiles.every(
        (tile) =>
          tile.complete &&
          tile.naturalWidth > 0 &&
          tile.classList.contains('leaflet-tile-loaded') &&
          Number(getComputedStyle(tile).opacity) >= 0.99,
      )
    );
  });
  await page.locator('.leaflet-container').screenshot({
    path:
      root +
      '/test-results/location-map-' +
      (process.env.MOBILE ? 'mobile' : 'desktop') +
      '.png',
  });
  await page.screenshot({
    path:
      root +
      '/test-results/location-manual-' +
      (process.env.MOBILE ? 'mobile' : 'desktop') +
      '.png',
    fullPage: true,
  });
  await page.context().grantPermissions(['geolocation']);
  const login = async (email) => {
    await page.goto('http://localhost:5173/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill('DemoVisual123!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('heading', { name: 'Hello, Demo.' }).waitFor();
  };
  for (const role of ['restaurant', 'ngo']) {
    await page.goto('http://localhost:5173/register');
    await page.getByLabel('Your name').fill(`Demo ${role}`);
    await page
      .getByLabel('Email', { exact: true })
      .fill(`${role}@demo.example`);
    await page.getByLabel('Password', { exact: true }).fill('DemoVisual123!');
    await page.getByLabel('I am joining as').selectOption(role);
    await page
      .getByRole('button', { name: 'Create account', exact: true })
      .click();
    await page.getByText('Account created.', { exact: false }).waitFor();
    const link = readDevInbox(`${role}@demo.example`).at(-1)?.url;
    assert(link, 'Local verification inbox must contain a real generated link');
    await page.goto(link);
    await page
      .getByRole('button', { name: 'Verify email', exact: true })
      .click();
    await page.getByText('Done. You can now sign in.').waitFor();
    await login(`${role}@demo.example`);
    await page
      .getByRole('link', { name: 'Organization & preferences', exact: true })
      .click();
    const fields = {
      'Organization name': `Demo ${role}`,
      'Registration number': 'DEMO123',
      Address: '123 Demo Street',
      'IANA timezone': 'Asia/Kolkata',
      'Daily meals capacity': '100',
      'Or an externally hosted proof URL': 'https://example.com/proof',
      'Opening hour (0-24)': '0',
      'Closing hour (0-24)': '24',
    };
    for (const [label, value] of Object.entries(fields))
      await page.getByLabel(label, { exact: true }).fill(value);
    await page
      .getByRole('button', { name: 'Use my location', exact: true })
      .click();
    await page
      .getByText('Current location selected.', { exact: false })
      .waitFor();
    if (role === 'restaurant')
      await page.screenshot({
        path:
          root +
          '/test-results/proof-form-' +
          (process.env.MOBILE ? 'mobile' : 'desktop') +
          '.png',
        fullPage: true,
      });
    await page
      .getByRole('button', { name: 'Submit for review', exact: true })
      .click();
    await page
      .getByText('Submitted for admin review. Changes require reapproval.')
      .waitFor();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await login('admin@demo.example');
    const card = page.locator('article').filter({
      has: page.getByRole('heading', {
        name: `Demo ${role} · ${role} · pending`,
        exact: true,
      }),
    });
    await card.getByRole('button', { name: 'Approve', exact: true }).click();
    await page
      .getByRole('heading', {
        name: `Demo ${role} · ${role} · approved`,
        exact: true,
      })
      .waitFor();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    console.log(`${role} signup/email/organization/admin approval passed`);
  }
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
  await page.getByRole('button', { name: 'Use organization location' }).click();
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
    path:
      root +
      '/test-results/' +
      (process.env.MOBILE ? 'mobile-' : 'desktop-') +
      'replate-ngo-claim.png',
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
    path:
      root +
      '/test-results/' +
      (process.env.MOBILE ? 'mobile-' : 'desktop-') +
      'replate-completed-pickup.png',
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
    path:
      root +
      '/test-results/' +
      (process.env.MOBILE ? 'mobile-' : 'desktop-') +
      'replate-admin.png',
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
