// Real browser lifecycle regression against production build; disposable HTTP host.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');
const root = new URL('../../client/dist', import.meta.url).pathname;
let version = 1;
const server = createServer(async (req, res) => {
  try {
    let file = new URL(req.url, 'http://localhost').pathname;
    if (file.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(
        JSON.stringify({ success: false, message: 'Sign in required' }),
      );
    }
    if (file === '/' || !path.extname(file)) file = '/index.html';
    let data = await readFile(root + file);
    if (file === '/index.html' && version === 2)
      data = Buffer.from(data.toString().replace('<title>', '<title>Updated '));
    if (file === '/sw.js' && version === 2)
      data = Buffer.from(
        data
          .toString()
          .replace(
            /url:"index.html",revision:"[^"]+"/,
            'url:"index.html",revision:"lifecycle-v2"',
          ),
      );
    const ext = path.extname(file);
    res.setHeader(
      'Content-Type',
      {
        '.js': 'application/javascript',
        '.html': 'text/html',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
      }[ext] || 'application/octet-stream',
    );
    res.setHeader('Cache-Control', 'no-store');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}).listen(5888);
const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  const context = await browser.newContext();
  const page = await context.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('http://localhost:5888');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  version = 2;
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    await r.update();
  });
  await page
    .getByRole('button', { name: 'Update app' })
    .waitFor({ timeout: 20000 });
  await page.screenshot({
    path: new URL('../../test-results/pwa-real-waiting.png', import.meta.url)
      .pathname,
  });
  await page.getByRole('button', { name: 'Update app' }).click();
  await page
    .waitForFunction(
      () => document.title.startsWith('Updated'),
      {},
      { timeout: 5000 },
    )
    .catch(async () => {
      console.log(
        'diagnostic',
        await page.evaluate(async () => ({
          title: document.title,
          regs: (await navigator.serviceWorker.getRegistrations()).map((r) => ({
            active: r.active?.state,
            waiting: r.waiting?.state,
            controller: navigator.serviceWorker.controller?.scriptURL,
          })),
        })),
      );
      throw Error('Update did not load new shell');
    });
  console.log(
    'Real production SW lifecycle: waiting banner, explicit update, new shell reload PASS',
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
