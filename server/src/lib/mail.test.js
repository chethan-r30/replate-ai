import { it, expect, vi, afterEach } from 'vitest';
import {
  deliverEmail,
  sendActionEmail,
  readDevInbox,
  clearDevInbox,
} from './mail.js';
afterEach(() => vi.unstubAllGlobals());
const config = {
  EMAIL_PROVIDER: 'brevo',
  BREVO_API_KEY: 'synthetic-key',
  BREVO_SENDER_EMAIL: 'owner@example.com',
  NODE_ENV: 'production',
  CLIENT_URL: 'https://example.com',
};
const message = {
  to: 'test@example.com',
  subject: 'Synthetic mail',
  text: 'Synthetic text',
};
it('sends only scoped plaintext transactional payload over HTTPS and accepts provider success', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response('{}', { status: 201 }));
  vi.stubGlobal('fetch', fetcher);
  expect(await deliverEmail(message, config)).toBe(true);
  expect(fetcher.mock.calls[0][0]).toBe('https://api.brevo.com/v3/smtp/email');
  const options = fetcher.mock.calls[0][1];
  expect(options.headers['api-key']).toBe('synthetic-key');
  expect(JSON.parse(options.body)).toEqual({
    sender: { name: 'ReplateAI', email: 'owner@example.com' },
    to: [{ email: 'test@example.com' }],
    subject: 'Synthetic mail',
    textContent: 'Synthetic text',
  });
});
it('fails closed for absent credentials, quota, network and never falls back to a paid provider', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response('{}', { status: 429 }));
  vi.stubGlobal('fetch', fetcher);
  expect(
    await deliverEmail(message, { ...config, BREVO_API_KEY: 'REPLACE_ME' }),
  ).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
  expect(await deliverEmail(message, config)).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockRejectedValue(new Error('synthetic network failure'));
  expect(await deliverEmail(message, config)).toBe(false);
});
it('keeps real action links out of production fallback inbox and only uses dev inbox locally', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('{}', { status: 400 })),
  );
  const user = { email: 'test@example.com' };
  clearDevInbox(user.email);
  expect(await sendActionEmail(user, 'verify', 'synthetic-token', config)).toBe(
    false,
  );
  expect(readDevInbox(user.email)).toHaveLength(0);
  await sendActionEmail(user, 'verify', 'synthetic-token', {
    ...config,
    NODE_ENV: 'test',
  });
  expect(readDevInbox(user.email)[0].url).toBe(
    'https://example.com/verify-email?token=synthetic-token',
  );
  clearDevInbox(user.email);
});
