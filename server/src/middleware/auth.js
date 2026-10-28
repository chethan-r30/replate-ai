import { Organization } from '../models/Organization.js';
import { profile } from '../lib/profile.js';
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
const readClaimNgo = batchRead(
  (ids) =>
    Organization.find({
      owner: { $in: ids },
      type: 'ngo',
      verificationStatus: 'approved',
    }).lean(),
  (org) => org.owner,
);
export const requireAuth = (config) =>
  asyncRoute(async (req, _res, next) => {
    const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(
      req.headers.authorization || '',
    );
    if (!match) throw new AppError(401, 'Sign in required');
    const authStart = performance.now();
    const token = verifyToken(match[1], 'access', config);
    const claimCreate =
      req.method === 'POST' &&
      req.originalUrl.split('?')[0].replace(/\/$/, '') === '/api/v1/claims';
    const [user, ngo] = await Promise.all([
      readUser(token.sub),
      claimCreate ? readClaimNgo(token.sub) : Promise.resolve(null),
    ]);
    if (claimCreate) req.approvedClaimNgo = ngo;
    if (!user) throw new AppError(401, 'Sign in required');
    profile('auth', performance.now() - authStart);
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
