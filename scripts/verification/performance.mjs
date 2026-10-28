// Lighthouse uses the built frontend and an ephemeral local API/database.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';
import lighthouse from 'lighthouse';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../../server/src/app.js';
import { parseEnv } from '../../server/src/config/env.js';
const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
let server, web, browser;
try {
  await mongoose.connect(mongo.getUri());
  const config = parseEnv({
    NODE_ENV: 'test',
    CLIENT_URL: 'http://localhost:4173',
    MONGODB_URI: mongo.getUri(),
    JWT_ACCESS_SECRET: 'a'.repeat(48),
    JWT_REFRESH_SECRET: 'b'.repeat(48),
    RATE_LIMIT_MAX: 100000,
  });
  server = createApp(config).listen(5000);
  web = spawn(
    'node',
    [
      '../node_modules/vite/bin/vite.js',
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      '4173',
    ],
    { cwd: new URL('../../client', import.meta.url), stdio: 'ignore' },
  );
  for (let i = 0; i < 60; i++) {
    try {
      await fetch('http://localhost:4173');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  browser = await chromium.launch({
    args: ['--no-sandbox', '--remote-debugging-port=9222'],
  });
  await mkdir('test-results', { recursive: true });
  const context = await browser.newContext();
  const page = await context.newPage({ viewport: { width: 390, height: 844 } });
  for (const path of ['/', '/listings', '/login', '/impact']) {
    await page.goto('http://localhost:4173' + path);
    await page.waitForTimeout(500);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    if (result.violations.length)
      throw new Error(
        'Accessibility violations ' +
          path +
          ': ' +
          JSON.stringify(
            result.violations.map((x) => ({ id: x.id, impact: x.impact })),
          ),
      );
  }
  await page.screenshot({
    path: 'test-results/phase7-mobile-impact.png',
    fullPage: true,
  });
  await page.close();

  const scores = {};
  for (const path of ['/', '/listings', '/login', '/impact']) {
    const { lhr, report } = await lighthouse('http://localhost:4173' + path, {
      port: 9222,
      output: 'html',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      chromeFlags: ['--no-sandbox'],
      throttlingMethod: 'simulate',
    });
    const name = path === '/' ? 'home' : path.slice(1);
    scores[name] = Object.fromEntries(
      Object.entries(lhr.categories).map(([k, v]) => [
        k,
        Math.round(v.score * 100),
      ]),
    );
    await writeFile('test-results/lighthouse-' + name + '.html', report);
    const failed = Object.values(lhr.audits)
      .filter(
        (x) => x.score !== null && x.score < 1 && x.details?.items?.length,
      )
      .map((x) => ({
        id: x.id,
        title: x.title,
        score: x.score,
        items: x.details.items.slice(0, 3),
      }));
    await writeFile(
      'test-results/lighthouse-' + name + '-failures.json',
      JSON.stringify(failed, null, 2),
    );
  }
  await writeFile(
    'test-results/lighthouse-scores.json',
    JSON.stringify(scores, null, 2),
  );
  console.log(scores);
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
