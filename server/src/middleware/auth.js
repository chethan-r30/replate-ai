// Re-read user status for every request so role changes and deletion take effect.
import { batchRead } from '../services/read-batch.js';
import { z } from 'zod';
import { verifyToken } from '../lib/tokens.js';
import { User } from '../models/User.js';
import { AppError, asyncRoute } from './errors.js';
const readUser = batchRead(
  (ids) => User.find({ _id: { $in: ids }, deletedAt: null }).lean(),
  (user) => user._id,
);
export const requireAuth = (config) =>
  asyncRoute(async (req, _res, next) => {
    const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(
      req.headers.authorization || '',
    );
    if (!match) throw new AppError(401, 'Sign in required');
    const token = verifyToken(match[1], 'access', config);
    const user = await readUser(token.sub);
    if (!user) throw new AppError(401, 'Sign in required');
    req.user = user;
    next();
  });
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role))
      return next(new AppError(403, 'Permission denied'));
    next();
  };
export const requireVerified = (req, _res, next) => {
  if (!req.user.isEmailVerified || req.user.verificationStatus !== 'approved')
    return next(new AppError(403, 'Email and organization approval required'));
  next();
};
export const objectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid identifier');
export const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
