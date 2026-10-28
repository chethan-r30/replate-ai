import { deleteAccount } from '../services/privacy.js';
// Full email/password lifecycle with rotating refresh families and single-use links.
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { User, publicUser } from '../models/User.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { ActionToken } from '../models/ActionToken.js';
import {
  digest,
  opaqueToken,
  tokenId,
  signAccess,
  signRefresh,
  verifyToken,
} from '../lib/tokens.js';
import { sendActionEmail, readDevInbox } from '../lib/mail.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError, asyncRoute, ok } from '../middleware/errors.js';
const email = z.string().trim().toLowerCase().email().max(254);
const password = z
  .string()
  .min(12)
  .max(72)
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/[0-9]/, 'Include a number');
const loginSchema = z
  .object({ email, password: z.string().min(1).max(72) })
  .strict();
const tokenSchema = z
  .object({ token: z.string().regex(/^[a-f\d]{64}$/) })
  .strict();
export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email,
    password,
    role: z.enum(['restaurant', 'ngo', 'volunteer']),
  })
  .strict();
export function authRoutes(config) {
  const router = Router();
  const cookie = {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: 7 * 86400000,
  };
  // Host-only cookies avoid broad subdomain access and work on localhost.
  const clear = (res) =>
    res.clearCookie('refreshToken', { ...cookie, maxAge: undefined });
  const originGuard = (req, _res, next) => {
    if (req.headers.origin && req.headers.origin !== config.CLIENT_URL)
      return next(new AppError(403, 'Origin not allowed'));
    next();
  };
  const limiter = rateLimit({
    windowMs: 900000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) =>
      `${req.path}:${req.ip}:${typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : 'invalid'}`,
    handler: (_req, _res, next) =>
      next(new AppError(429, 'Too many authentication attempts')),
  });
  async function action(user, type) {
    const token = opaqueToken();
    await ActionToken.updateMany(
      { user: user._id, type, usedAt: null },
      { $set: { usedAt: new Date() } },
    );
    await ActionToken.create({
      user: user._id,
      type,
      tokenHash: digest(token),
      expiresAt: new Date(
        Date.now() + (type === 'verify' ? 86400000 : 3600000),
      ),
    });
    return sendActionEmail(user, type, token, config);
  }
  async function session(user, res, family = tokenId()) {
    const token = signRefresh(user, family, config);
    await RefreshToken.create({
      user: user._id,
      tokenHash: digest(token),
      family,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    });
    res.cookie('refreshToken', token, cookie);
    return { accessToken: signAccess(user, config), user: publicUser(user) };
  }
  router.post(
    '/register',
    limiter,
    asyncRoute(async (req, res) => {
      const data = registerSchema.parse(req.body);
      const user = await User.create({
        ...data,
        password: undefined,
        passwordHash: await bcrypt.hash(data.password, 12),
      });
      const emailSent = await action(user, 'verify');
      ok(res, { user: publicUser(user), emailSent }, 201);
    }),
  );
  router.post(
    '/login',
    limiter,
    asyncRoute(async (req, res) => {
      const data = loginSchema.parse(req.body);
      const user = await User.findOne({
        email: data.email,
        deletedAt: null,
      }).select('+passwordHash');
      if (!user) {
        await bcrypt.compare(
          data.password,
          '$2b$12$05JUEwkBRkwF8.UYKpPse.gGPrZ8HAXX5z3XjUqFZxJzHq7rCjU8K',
        );
        throw new AppError(401, 'Invalid email or password');
      }
      if (user.lockedUntil > new Date())
        throw new AppError(429, 'Account temporarily locked');
      if (!(await bcrypt.compare(data.password, user.passwordHash))) {
        const failures = user.loginFailures + 1;
        await User.updateOne(
          { _id: user._id },
          {
            $inc: { loginFailures: 1 },
            ...(failures >= 5
              ? { $set: { lockedUntil: new Date(Date.now() + 900000) } }
              : {}),
          },
        );
        throw new AppError(401, 'Invalid email or password');
      }
      await User.updateOne(
        { _id: user._id },
        { $set: { loginFailures: 0 }, $unset: { lockedUntil: 1 } },
      );
      ok(res, await session(user, res));
    }),
  );
  router.post(
    '/refresh',
    originGuard,
    asyncRoute(async (req, res) => {
      z.object({})
        .strict()
        .parse(req.body || {});
      const token = req.cookies.refreshToken;
      if (!token) throw new AppError(401, 'Refresh token required');
      const payload = verifyToken(token, 'refresh', config);
      const record = await RefreshToken.findOneAndUpdate(
        {
          tokenHash: digest(token),
          revokedAt: null,
          expiresAt: { $gt: new Date() },
        },
        { $set: { revokedAt: new Date() } },
        { new: false },
      );
      if (!record) {
        await RefreshToken.updateMany(
          { family: payload.family },
          { $set: { revokedAt: new Date() } },
        );
        clear(res);
        throw new AppError(401, 'Refresh reuse detected; sign in again');
      }
      const user = await User.findOne({ _id: payload.sub, deletedAt: null });
      if (!user) throw new AppError(401, 'Sign in required');
      ok(res, await session(user, res, payload.family));
    }),
  );
  router.post(
    '/logout',
    originGuard,
    asyncRoute(async (req, res) => {
      z.object({})
        .strict()
        .parse(req.body || {});
      if (req.cookies.refreshToken)
        await RefreshToken.updateOne(
          { tokenHash: digest(req.cookies.refreshToken) },
          { $set: { revokedAt: new Date() } },
        );
      clear(res);
      ok(res, null);
    }),
  );
  router.post(
    '/verify-email',
    asyncRoute(async (req, res) => {
      const { token } = tokenSchema.parse(req.body);
      const record = await ActionToken.findOneAndUpdate(
        {
          tokenHash: digest(token),
          type: 'verify',
          usedAt: null,
          expiresAt: { $gt: new Date() },
        },
        { $set: { usedAt: new Date() } },
      );
      if (!record)
        throw new AppError(400, 'Invalid or expired verification link');
      await User.updateOne(
        { _id: record.user },
        { $set: { isEmailVerified: true } },
      );
      ok(res, null);
    }),
  );
  router.post(
    '/forgot-password',
    limiter,
    asyncRoute(async (req, res) => {
      const data = z.object({ email }).strict().parse(req.body);
      const user = await User.findOne({ email: data.email, deletedAt: null });
      if (user) await action(user, 'reset');
      ok(res, {
        message: 'If this account exists, a reset email has been requested',
      });
    }),
  );
  router.post(
    '/reset-password',
    limiter,
    asyncRoute(async (req, res) => {
      const data = tokenSchema.extend({ password }).parse(req.body);
      const hash = await bcrypt.hash(data.password, 12);
      const record = await ActionToken.findOneAndUpdate(
        {
          tokenHash: digest(data.token),
          type: 'reset',
          usedAt: null,
          expiresAt: { $gt: new Date() },
        },
        { $set: { usedAt: new Date() } },
      );
      if (!record) throw new AppError(400, 'Invalid or expired reset link');
      await User.updateOne(
        { _id: record.user },
        {
          $set: { passwordHash: hash, loginFailures: 0 },
          $unset: { lockedUntil: 1 },
        },
      );
      await RefreshToken.updateMany(
        { user: record.user },
        { $set: { revokedAt: new Date() } },
      );
      clear(res);
      ok(res, null);
    }),
  );
  router.delete(
    '/me',
    originGuard,
    requireAuth(config),
    limiter,
    asyncRoute(async (req, res) => {
      const data = z
        .object({
          password: z.string().min(1).max(72),
          confirmation: z.literal('DELETE'),
        })
        .strict()
        .parse(req.body);
      const user = await User.findById(req.user._id).select('+passwordHash');
      if (!user || !(await bcrypt.compare(data.password, user.passwordHash)))
        throw new AppError(401, 'Password confirmation failed');
      await deleteAccount(user);
      clear(res);
      ok(res, null);
    }),
  );
  router.get(
    '/me',
    requireAuth(config),
    asyncRoute(async (req, res) => {
      z.object({}).strict().parse(req.query);
      ok(res, publicUser(req.user));
    }),
  );
  // Explicit disposable-sandbox inbox helps local testing without email credentials.
  if (config.LOCAL_SANDBOX && config.NODE_ENV !== 'production')
    router.get(
      '/dev-inbox',
      asyncRoute(async (req, res) => {
        const data = z.object({ email }).strict().parse(req.query);
        ok(res, readDevInbox(data.email));
      }),
    );
  return router;
}
