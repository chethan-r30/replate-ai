import { it, expect } from 'vitest';
import { staticConfig, prepareOutput } from './prepare-vercel-output.js';
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
it('preserves proxy, SPA and root security headers without copying private files', async () => {
  const config = JSON.parse(await readFile('vercel.json', 'utf8'));
  const output = staticConfig(config);
  expect(output.version).toBe(3);
  expect(new RegExp(output.routes[0].src).test('/')).toBe(true);
  expect(output.routes[0].headers['Content-Security-Policy']).toContain(
    "default-src 'self'",
  );
  const rewrites = output.routes.filter((r) => r.dest);
  expect(rewrites[0].dest).toContain('https://replate-api.onrender.com/api/');
  expect(rewrites[1].dest).toContain('/index.html');
  const root = await mkdtemp(join(tmpdir(), 'replate-output-'));
  try {
    await mkdir(join(root, 'client/dist'), { recursive: true });
    await writeFile(join(root, 'client/dist/index.html'), '<h1>demo</h1>');
    await writeFile(join(root, '.env'), 'SECRET=not-public');
    await writeFile(join(root, 'vercel.json'), JSON.stringify(config));
    await prepareOutput(root);
    expect((await readdir(join(root, '.vercel/output'))).sort()).toEqual([
      'config.json',
      'static',
    ]);
    expect(await readdir(join(root, '.vercel/output/static'))).toEqual([
      'index.html',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
