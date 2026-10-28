// Write public routing only. API origin is not a credential. Never put secrets here.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export function withApiOrigin(config, origin) {
  const url = new URL(origin);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(
      'API origin must be a plain HTTPS origin without credentials/path/query',
    );
  return {
    ...config,
    rewrites: [
      { source: '/api/:path*', destination: url.origin + '/api/:path*' },
      { source: '/:path*', destination: '/index.html' },
    ],
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const file = new URL('../vercel.json', import.meta.url);
  const config = JSON.parse(await readFile(file, 'utf8'));
  await writeFile(
    file,
    JSON.stringify(
      withApiOrigin(config, process.env.REPLATE_API_ORIGIN),
      null,
      2,
    ) + '\n',
  );
  console.log(
    'Updated public Vercel API rewrite. Review and commit vercel.json before deploying.',
  );
}
