import { it, expect } from 'vitest';
import { withApiOrigin } from './configure-vercel.js';
it('writes API before SPA routing and rejects unsafe origins', () => {
  expect(withApiOrigin({}, 'https://api.example.com').rewrites).toEqual([
    {
      source: '/api/:path*',
      destination: 'https://api.example.com/api/:path*',
    },
    { source: '/:path*', destination: '/index.html' },
  ]);
  for (const url of [
    'http://example.com',
    'https://user:secret@example.com',
    'https://example.com/path',
    'https://example.com?token=bad',
  ])
    expect(() => withApiOrigin({}, url)).toThrow();
});
