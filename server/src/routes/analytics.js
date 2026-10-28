import mongoose from 'mongoose';
// Derive impact from completed pickups, never invented counters.
import { sharedGet, sharedSet } from '../services/shared-cache.js';
import { Router } from 'express';
import { z } from 'zod';
import { FoodListing } from '../models/FoodListing.js';
import { Claim } from '../models/Claim.js';
import { Organization } from '../models/Organization.js';
import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import { AuditLog } from '../models/AuditLog.js';
import {
  requireAuth,
  requireRole,
  pagination,
  objectId,
} from '../middleware/auth.js';
import { ok, asyncRoute, AppError } from '../middleware/errors.js';
export async function impact(match = {}) {
  const rows = await FoodListing.aggregate([
    { $match: { ...match, status: 'picked_up' } },
    {
      $group: {
        _id: null,
        mealsSaved: { $sum: '$servings' },
        kgSaved: {
          $sum: { $cond: [{ $eq: ['$unit', 'kg'] }, '$quantity', 0] },
        },
      },
    },
  ]);
  const data = rows[0] || { mealsSaved: 0, kgSaved: 0 };
  delete data._id;
  return {
    ...data,
    co2eAvoidedEstimateKg: Math.round(data.kgSaved * 2.5 * 100) / 100,
    methodology:
      'Meals are recorded servings picked up. Weight counts only explicitly weighed kg listings. CO2e uses an illustrative 2.5 kg/kg factor, not verified emissions accounting.',
  };
}
export function analyticsRoutes(config) {
  const r = Router();
  r.get(
    '/public',
    asyncRoute(async (req, res) => {
      z.object({}).strict().parse(req.query);
      res.set('Cache-Control', 'public, max-age=60');
      const existing = await sharedGet('impact:public');
      ok(
        res,
        existing || (await sharedSet('impact:public', await impact(), 60000)),
      );
    }),
  );
  r.get(
    '/restaurant',
    requireAuth(config),
    requireRole('restaurant'),
    asyncRoute(async (req, res) => {
      z.object({}).strict().parse(req.query);
      const org = await Organization.findOne({ owner: req.user._id });
      const match = { restaurant: org?._id || null };
      ok(res, {
        impact: await impact(match),
        activeListings: await FoodListing.countDocuments({
          ...match,
          status: 'available',
        }),
        pendingClaims: await Claim.countDocuments({
          ...match,
          status: 'requested',
        }),
      });
    }),
  );
  r.get(
    '/ngo',
    requireAuth(config),
    requireRole('ngo'),
    asyncRoute(async (req, res) => {
      z.object({}).strict().parse(req.query);
      const org = await Organization.findOne({ owner: req.user._id });
      const completed = await Claim.find({
        ngo: org?._id || null,
        status: 'picked_up',
      })
        .select('listing')
        .lean();
      ok(res, {
        impact: await impact({ _id: { $in: completed.map((x) => x.listing) } }),
        pendingClaims: await Claim.countDocuments({
          ngo: org?._id || null,
          status: { $in: ['requested', 'approved'] },
        }),
      });
    }),
  );
  r.get(
    '/admin',
    requireAuth(config),
    requireRole('admin'),
    asyncRoute(async (req, res) => {
      z.object({}).strict().parse(req.query);
      const total = await FoodListing.countDocuments();
      ok(res, {
        impact: await impact(),
        activeUsers: await User.countDocuments({ deletedAt: null }),
        totalListings: total,
        claimRate: total
          ? (await FoodListing.countDocuments({
              status: { $in: ['reserved', 'picked_up'] },
            })) / total
          : 0,
        expiryRate: total
          ? (await FoodListing.countDocuments({ status: 'expired' })) / total
          : 0,
      });
    }),
  );
  return r;
}
export function notificationRoutes(config) {
  const r = Router();
  r.use(requireAuth(config));
  r.get(
    '/',
    asyncRoute(async (req, res) => {
      const { page, limit } = pagination.strict().parse(req.query);
      ok(res, {
        items: await Notification.find({ user: req.user._id })
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        page,
        limit,
      });
    }),
  );
  r.patch(
    '/:id/read',
    asyncRoute(async (req, res) => {
      const id = objectId.parse(req.params.id);
      z.object({})
        .strict()
        .parse(req.body || {});
      const n = await Notification.findOneAndUpdate(
        { _id: id, user: req.user._id },
        { $set: { readAt: new Date() } },
        { new: true },
      );
      if (!n) throw new AppError(404, 'Notification not found');
      ok(res, n);
    }),
  );
  return r;
}
export function adminRoutes(config) {
  const r = Router();
  r.use(requireAuth(config), requireRole('admin'));
  r.get(
    '/audit',
    asyncRoute(async (req, res) => {
      const { page, limit } = pagination.strict().parse(req.query);
      ok(res, {
        items: await AuditLog.find()
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        page,
        limit,
      });
    }),
  );
  r.get(
    '/users',
    asyncRoute(async (req, res) => {
      const { page, limit } = pagination.strict().parse(req.query);
      ok(res, {
        items: await User.find()
          .select('name email role verificationStatus deletedAt')
          .sort({ _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        page,
        limit,
      });
    }),
  );
  r.patch(
    '/users/:id',
    asyncRoute(async (req, res) => {
      const id = objectId.parse(req.params.id);
      const data = z.object({ disabled: z.boolean() }).strict().parse(req.body);
      if (id === String(req.user._id))
        throw new AppError(400, 'Cannot disable your own account');
      const target = await User.findById(id).select('role');
      if (target?.role === 'admin')
        throw new AppError(
          403,
          'Admin accounts cannot be disabled through this endpoint',
        );
      const user = await mongoose.connection.transaction(async () => {
        const changed = await User.findByIdAndUpdate(
          id,
          { $set: { deletedAt: data.disabled ? new Date() : null } },
          { new: true },
        );
        if (!changed) throw new AppError(404, 'User not found');
        await AuditLog.create({
          actor: req.user._id,
          action: data.disabled ? 'user.disable' : 'user.enable',
          target: id,
        });
        return changed;
      });
      ok(res, { id: user._id, disabled: Boolean(user.deletedAt) });
    }),
  );
  r.post(
    '/listings/:id/moderate',
    asyncRoute(async (req, res) => {
      const id = objectId.parse(req.params.id);
      const { reason } = z
        .object({ reason: z.string().min(3).max(500) })
        .strict()
        .parse(req.body);
      const listing = await mongoose.connection.transaction(async () => {
        const changed = await FoodListing.findOneAndUpdate(
          { _id: id, status: 'available' },
          { $set: { status: 'cancelled' } },
          { new: true },
        );
        if (!changed)
          throw new AppError(409, 'Only available listings may be moderated');
        await AuditLog.create({
          actor: req.user._id,
          action: 'listing.moderate',
          target: id,
          reason,
        });
        return changed;
      });
      ok(res, listing);
    }),
  );
  return r;
}
