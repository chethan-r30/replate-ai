// Explicit local sandbox: disposable MongoDB and ephemeral JWT keys, never production.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { parseEnv } from './config/env.js';
import { start } from './index.js';
if (process.env.NODE_ENV === 'production')
  throw new Error('Local sandbox cannot run in production');
const mongo = await MongoMemoryServer.create();
console.warn(
  'LOCAL SANDBOX: disposable data and keys. External integrations are disabled until configured.',
);
const config = parseEnv({
  ...process.env,
  NODE_ENV: 'development',
  MONGODB_URI: mongo.getUri(),
  JWT_ACCESS_SECRET: randomBytes(48).toString('hex'),
  JWT_REFRESH_SECRET: randomBytes(48).toString('hex'),
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
});
await start(config);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => mongo.stop());
