// Public safe listing reads; only approved restaurant owners may mutate listings.
import mongoose from 'mongoose';
import { SurplusHistory } from '../models/SurplusHistory.js';
import { cached, cache, clearCache } from '../services/cache.js';
import { Router } from 'express';
import { notifyMatches } from '../services/matching.js';
import { logger } from '../lib/logger.js';
import { z } from 'zod';
import { FoodListing } from '../models/FoodListing.js';
import { Organization } from '../models/Organization.js';
import { listingSchema, searchSchema } from '../services/schemas.js';
import {
  requireAuth,
  requireRole,
  requireVerified,
  objectId,
  pagination,
} from '../middleware/auth.js';
import { AppError, asyncRoute, ok } from '../middleware/errors.js';
export function listingRoutes(config) {
  const r = Router();
  const auth = requireAuth(config);
  const search = asyncRoute(async (req, res) => {
    const v = searchSchema.parse(req.query);
    const cacheKey = 'search:' + JSON.stringify(v);
    const existing = cached(cacheKey);
    if (existing) {
      res.set('Cache-Control', 'public, max-age=1');
      return ok(res, existing);
    }
    const match = {
      status: 'available',
      bestBefore: { $gt: new Date() },
      'pickupWindow.end': { $gt: new Date() },
      ...(v.category ? { category: v.category } : {}),
      ...(v.dietary ? { dietary: v.dietary } : {}),
    };
    if (v.pickupBefore) match['pickupWindow.start'] = { $lte: v.pickupBefore };
    let data;
    if (v.lat !== undefined) {
      data = await FoodListing.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [v.lng, v.lat] },
            distanceField: 'distanceMeters',
            maxDistance: v.radius * 1000,
            spherical: true,
            query: match,
          },
        },
        { $skip: (v.page - 1) * v.limit },
        { $limit: v.limit },
        { $project: { reservedBy: 0, activeClaim: 0, notifiedOrgs: 0 } },
      ]);
    } else
      data = await FoodListing.find(match)
        .sort({ bestBefore: 1, _id: 1 })
        .skip((v.page - 1) * v.limit)
        .limit(v.limit)
        .select('-reservedBy -activeClaim -notifiedOrgs')
        .lean();
    // One-second browse cache is advisory only; claim always validates live state.
    res.set('Cache-Control', 'public, max-age=1');
    ok(
      res,
      cache(cacheKey, { items: data, page: v.page, limit: v.limit }, 1000),
    );
  });
  r.get('/', search);
  r.get('/nearby', search);
  r.get(
    '/mine',
    auth,
    asyncRoute(async (req, res) => {
      const { page, limit } = pagination.strict().parse(req.query);
      const org = await Organization.findOne({ owner: req.user._id });
      ok(res, {
        items: org
          ? await FoodListing.find({ restaurant: org._id })
              .sort({ createdAt: -1 })
              .skip((page - 1) * limit)
              .limit(limit)
              .lean()
          : [],
        page,
        limit,
      });
    }),
  );
  r.get(
    '/:id',
    asyncRoute(async (req, res) => {
      const id = objectId.parse(req.params.id);
      const listing = await FoodListing.findById(id)
        .select('-reservedBy -activeClaim -notifiedOrgs')
        .lean();
      if (!listing) throw new AppError(404, 'Listing not found');
      clearCache();
      ok(res, listing);
    }),
  );
  r.post(
    '/',
    auth,
    requireRole('restaurant'),
    requireVerified,
    asyncRoute(async (req, res) => {
      const data = listingSchema.parse(req.body);
      const org = await Organization.findOne({
        owner: req.user._id,
        verificationStatus: 'approved',
      });
      if (!org) throw new AppError(403, 'Approved restaurant required');
      const listing = await mongoose.connection.transaction(async () => {
        const created = await FoodListing.create({
          ...data,
          restaurant: org._id,
        });
        await SurplusHistory.create({
          listing: created._id,
          restaurant: org._id,
          date: created.createdAt,
          category: created.category,
          quantityPosted: created.servings,
          quantityClaimed: 0,
        });
        return created;
      });
      clearCache();
      ok(res, listing, 201);
      notifyMatches(listing._id).catch(() =>
        logger.warn('Matching notifications delayed'),
      );
    }),
  );
  r.patch(
    '/:id',
    auth,
    requireRole('restaurant'),
    requireVerified,
    asyncRoute(async (req, res) => {
      const id = objectId.parse(req.params.id);
      const data = listingSchema.parse(req.body);
      const org = await Organization.findOne({ owner: req.user._id });
      if (!org) throw new AppError(403, 'Organization required');
      const listing = await mongoose.connection.transaction(async () => {
        const changed = await FoodListing.findOneAndUpdate(
          { _id: id, restaurant: org._id, status: 'available' },
          { $set: data },
          { new: true },
        );
        if (!changed)
          throw new AppError(409, 'Only your available listings may be edited');
        await SurplusHistory.updateOne(
          { listing: id },
          {
            $set: {
              category: changed.category,
              quantityPosted: changed.servings,
            },
          },
        );
        return changed;
      });
      clearCache();
      ok(res, listing);
    }),
  );
  r.delete(
    '/:id',
    auth,
    requireRole('restaurant'),
    requireVerified,
    asyncRoute(async (req, res) => {
      const id = objectId.parse(req.params.id);
      z.object({})
        .strict()
        .parse(req.body || {});
      const org = await Organization.findOne({ owner: req.user._id });
      if (!org) throw new AppError(403, 'Organization required');
      const listing = await FoodListing.findOneAndUpdate(
        { _id: id, restaurant: org._id, status: 'available' },
        { $set: { status: 'cancelled' } },
        { new: true },
      );
      if (!listing)
        throw new AppError(409, 'Only available listings may be cancelled');
      clearCache();
      ok(res, listing);
    }),
  );
  return r;
}
