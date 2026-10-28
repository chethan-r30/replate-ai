// Authenticate sockets and publish only to the signed-in user's private room.
import { Server } from 'socket.io';
import { coalesceEvents } from './coalesce-events.js';
import { verifyToken } from '../lib/tokens.js';
import { User } from '../models/User.js';
let io;
export function startRealtime(server, config) {
  io = new Server(server, {
    cors: { origin: config.CLIENT_URL, credentials: true },
    maxHttpBufferSize: 65536,
  });
  io.use(async (socket, next) => {
    try {
      const data = verifyToken(socket.handshake.auth?.token, 'access', config);
      const user = await User.findOne({ _id: data.sub, deletedAt: null });
      if (!user) throw new Error('Sign in required');
      socket.data.userId = String(user._id);
      socket.data.expires = data.exp;
      next();
    } catch {
      next(new Error('Sign in required'));
    }
  });
  io.on('connection', (socket) => {
    socket.join(socket.data.userId);
    const timer = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, socket.data.expires * 1000 - Date.now()),
    );
    socket.on('disconnect', () => clearTimeout(timer));
  });
  return io;
}
const emitHint = coalesceEvents((userId, data) =>
  io?.to(userId).emit('notification', data),
);
export const disconnectUser = (userId) =>
  io?.in(String(userId)).disconnectSockets(true);
export const emitNotification = (userId, data) => {
  if (io) emitHint(String(userId), data);
};
