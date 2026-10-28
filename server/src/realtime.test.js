// Sockets require a valid access JWT and only receive their own user-room events.
import { beforeAll, afterAll, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { io as connect } from 'socket.io-client';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { User } from './models/User.js';
import { signAccess } from './lib/tokens.js';
import { startRealtime, emitNotification } from './services/realtime.js';
let mongo, server, io, url;
const sockets = [];
const config = {
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  CLIENT_URL: 'http://localhost:5173',
};
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  server = createServer();
  io = startRealtime(server, config);
  await new Promise((r) => server.listen(0, r));
  url = `http://localhost:${server.address().port}`;
});
afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await new Promise((r) => io.close(r));
  await mongoose.disconnect();
  await mongo.stop();
});
function socket(token) {
  const s = connect(url, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });
  sockets.push(s);
  return s;
}
it('rejects invalid auth and isolates recipients', async () => {
  const users = await User.create(
    [1, 2].map((n) => ({
      name: 'Demo',
      email: `socket${n}@example.com`,
      role: 'ngo',
      passwordHash: 'unused',
    })),
  );
  const bad = socket('bad');
  await new Promise((r) => bad.once('connect_error', r));
  expect(bad.connected).toBe(false);
  const a = socket(signAccess(users[0], config)),
    b = socket(signAccess(users[1], config));
  await Promise.all(
    [a, b].map((s) => new Promise((r) => s.once('connect', r))),
  );
  let leaked = false;
  b.on('notification', () => {
    leaked = true;
  });
  const received = new Promise((r) => a.once('notification', r));
  emitNotification(users[0]._id, { message: 'Private test' });
  expect((await received).message).toBe('Private test');
  await new Promise((r) => setTimeout(r, 30));
  expect(leaked).toBe(false);
});
