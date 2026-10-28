// Authorized bounded AI endpoints degrade safely when external services are missing.
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { fileTypeFromBuffer } from 'file-type';
import { Organization } from '../models/Organization.js';
import { FoodListing } from '../models/FoodListing.js';
import { SurplusHistory } from '../models/SurplusHistory.js';
import { forecast, demandForecast } from '../ai/forecast.js';
import { parseInput, parseListing, forecastInsight } from '../ai/parser.js';
import { recommendations } from '../services/matching.js';
import { sharedGet, sharedSet } from '../services/shared-cache.js';
import { requireAuth, requireRole, objectId } from '../middleware/auth.js';
import { AppError, asyncRoute, ok } from '../middleware/errors.js';
export function aiRoutes(config) {
  const r = Router();
  r.use(requireAuth(config));
  r.use(
    rateLimit({
      windowMs: 3600000,
      limit: config.AI_RATE_LIMIT_PER_HOUR,
      keyGenerator: (req) => String(req.user._id),
      handler: (_req, _res, next) =>
        next(new AppError(429, 'Hourly AI limit reached')),
    }),
  );
  r.post(
    '/parse-listing',
    requireRole('restaurant'),
    asyncRoute(async (req, res) => {
      const data = parseInput.parse(req.body);
      if (data.image) {
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data.image.data))
          throw new AppError(400, 'Invalid image encoding');
        const bytes = Buffer.from(data.image.data, 'base64');
        const type = await fileTypeFromBuffer(bytes);
        if (
          bytes.length > 5 * 1024 * 1024 ||
          type?.mime !== data.image.mediaType
        )
          throw new AppError(400, 'Image bytes or size are invalid');
      }
      ok(res, await parseListing(data, config));
    }),
  );
  r.get(
    '/forecast',
    requireRole('restaurant'),
    asyncRoute(async (req, res) => {
      const { category } = z
        .object({
          category: z
            .enum(['cooked', 'bakery', 'produce', 'packaged', 'dairy'])
            .default('bakery'),
        })
        .strict()
        .parse(req.query);
      const org = await Organization.findOne({ owner: req.user._id });
      if (!org) throw new AppError(400, 'Create an organization first');
      const key = `forecast:${org._id}:${category}`;
      let result = await sharedGet(key);
      if (!result) {
        const history = await SurplusHistory.find({
          restaurant: org._id,
          category,
        })
          .sort({ date: -1 })
          .limit(365)
          .lean();
        const similar = await Organization.find({
          type: 'restaurant',
          _id: { $ne: org._id },
          location: { $near: { $geometry: org.location, $maxDistance: 10000 } },
        })
          .select('_id')
          .limit(100)
          .lean();
        const peers = await SurplusHistory.aggregate([
          {
            $match: {
              restaurant: { $in: similar.map((x) => x._id) },
              category,
            },
          },
          { $group: { _id: null, average: { $avg: '$quantityPosted' } } },
        ]);
        const numeric = forecast(history, {
          categoryAverage: peers[0]?.average || 0,
          timezone: org.timezone,
        });
        const areaHistory = await SurplusHistory.find({
          restaurant: { $in: [org._id, ...similar.map((x) => x._id)] },
          category,
        })
          .limit(1000)
          .lean();
        const demand = demandForecast(areaHistory, {
          categoryAverage: 0,
          timezone: org.timezone,
        });
        result = await sharedSet(key, {
          ...numeric,
          demand,
          insight: await forecastInsight(numeric, config),
          cachedHours: 6,
        });
      }
      ok(res, result);
    }),
  );
  r.get(
    '/recommendations/:listingId',
    asyncRoute(async (req, res) => {
      const id = objectId.parse(req.params.listingId);
      const listing = await FoodListing.findById(id).lean();
      if (!listing) throw new AppError(404, 'Listing not found');
      const org = await Organization.findOne({ owner: req.user._id });
      if (
        req.user.role !== 'admin' &&
        String(org?._id) !== String(listing.restaurant)
      )
        throw new AppError(
          403,
          'Only the listing owner can view matching organizations',
        );
      const matches = await recommendations(listing);
      ok(
        res,
        matches.map((x) => ({
          id: x._id,
          name: x.name,
          distanceMeters: x.distanceMeters,
          score: x.score,
          breakdown: x.breakdown,
          explanation: x.explanation,
        })),
      );
    }),
  );
  return r;
}
