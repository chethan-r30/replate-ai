// Package Node20-built browser assets, never source or environment files.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getTransformedRoutes } from '@vercel/routing-utils';
export function staticConfig(config) {
  const { routes, error } = getTransformedRoutes(config);
  if (error) throw new Error('Invalid Vercel routing configuration');
  // The root pathname must receive the same security headers as nested paths.
  const headerRoute = routes.find((route) => route.headers);
  if (headerRoute && config.headers?.[0]?.source === '/:path*')
    headerRoute.src = '^/.*$';
  return { version: 3, routes };
}
export async function prepareOutput(root = process.cwd()) {
  const config = JSON.parse(
    await readFile(resolve(root, 'vercel.json'), 'utf8'),
  );
  const output = resolve(root, '.vercel/output');
  await readFile(resolve(root, 'client/dist/index.html'));
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(resolve(root, 'client/dist'), resolve(output, 'static'), {
    recursive: true,
  });
  await writeFile(
    resolve(output, 'config.json'),
    JSON.stringify(staticConfig(config), null, 2),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await prepareOutput();
