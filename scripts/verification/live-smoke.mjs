// Read-only live checks, never seeds data or submits a claim.
import { writeFile, mkdir } from 'node:fs/promises';
const frontend = process.env.SMOKE_FRONTEND_URL,
  api = process.env.SMOKE_API_URL;
if (!frontend || !api)
  throw new Error('SMOKE_FRONTEND_URL and SMOKE_API_URL required');
const results = [];
for (const [name, url] of [
  ['home', frontend],
  ['spa', new URL('/listings', frontend)],
  ['health', new URL('/api/v1/health', api)],
  ['ready', new URL('/api/v1/ready', api)],
  ['impact', new URL('/api/v1/analytics/impact', api)],
]) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  const text = await response.text();
  const valid =
    name === 'home' || name === 'spa'
      ? text.includes('<div id="root">')
      : JSON.parse(text).success === true;
  results.push({
    name,
    url: String(url),
    status: response.status,
    passed: response.ok && valid,
  });
}
await mkdir('test-results', { recursive: true });
await writeFile(
  'test-results/live-smoke.json',
  JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2),
);
console.log(results);
if (results.some((x) => !x.passed)) process.exitCode = 1;
