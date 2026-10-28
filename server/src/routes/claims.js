import { trackBackground } from '../services/background.js';
// Only approved NGOs claim; only the restaurant confirms the NGO's pickup code.
import { batchRead } from '../services/read-batch.js';
import { Router } from 'express';
import { sendNotification } from '../services/notifications.js';
import { logger } from '../lib/logger.js';
import { z } from 'zod';
import { Claim } from '../models/Claim.js';
import { Organization } from '../models/Organization.js';
import { Feedback } from '../models/Feedback.js';
import { createClaim, changeClaim } from '../services/claims.js';
import {
  requireAuth,
  requireRole,
  requireVerified,
  objectId,
  pagination,
} from '../middleware/auth.js';
import { AppError, asyncRoute, ok } from '../middleware/errors.js';
const readNgo = batchRead(
  (ids) =>
    Organization.find({
      owner: { $in: ids },
      type: 'ngo',
      verificationStatus: 'approved',
    }).lean(),
  (org) => org.owner,
);
export function claimRoutes(config) {
  const r = Router();
  r.use(requireAuth(config));
  r.get(
    '/mine',
    asyncRoute(async (req, res) => {
      const { page, limit } = pagination.strict().parse(req.query);
      const org = await Organization.findOne({ owner: req.user._id });
      const query = org
        ? { $or: [{ ngo: org._id }, { restaurant: org._id }] }
        : { _id: null };
      const items = await Claim.find(query)
        .select(req.user.role === 'ngo' ? '+pickupCode' : '-pickupCode')
        .populate(
          'listing',
          'title bestBefore pickupWindow location servings quantity unit',
        )
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      ok(res, { items, page, limit });
    }),
  );
  r.post(
    '/',
    requireRole('ngo'),
    requireVerified,
    asyncRoute(async (req, res) => {
      const { listingId } = z
        .object({ listingId: objectId })
        .strict()
        .parse(req.body);
      const ngo = await readNgo(req.user._id);
      if (!ngo) throw new AppError(403, 'Approved NGO required');
      const claim = await createClaim(listingId, ngo);
      ok(res, claim, 201);
    }),
  );
  r.post(
    '/:id/:action(approve|reject|confirm-pickup|cancel|no-show)',
    requireVerified,
    asyncRoute(async (req, res) => {
      const id = objectId.parse(req.params.id);
      const action = z
        .enum(['approve', 'reject', 'confirm-pickup', 'cancel', 'no-show'])
        .parse(req.params.action);
      const body = (
        action === 'confirm-pickup'
          ? z.object({ code: z.string().regex(/^\d{6}$/) })
          : z.object({})
      )
        .strict()
        .parse(req.body);
      const mapped = {
        approve: 'approved',
        reject: 'rejected',
        'confirm-pickup': 'picked_up',
        cancel: 'cancelled',
        'no-show': 'no_show',
      };
      const claim = await changeClaim(id, req.user, mapped[action], body.code);
      ok(res, claim);
      const orgs = await Organization.find({
        _id: { $in: [claim.ngo, claim.restaurant] },
      }).select('owner');
      for (const org of orgs)
        trackBackground(
          sendNotification(
            org.owner,
            'claim-update',
            `Food claim status: ${claim.status}.`,
          ),
        ).catch(() => logger.warn('Claim notification delayed'));
    }),
  );
  r.post(
    '/:id/feedback',
    asyncRoute(async (req, res) => {
      const id = objectId.parse(req.params.id);
      const data = z
        .object({
          rating: z.number().int().min(1).max(5),
          comment: z.string().trim().max(1000).default(''),
        })
        .strict()
        .parse(req.body);
      const org = await Organization.findOne({ owner: req.user._id });
      const claim = await Claim.findById(id);
      if (!org || !claim || claim.status !== 'picked_up')
        throw new AppError(409, 'Completed claim required');
      const isNgo = String(org._id) === String(claim.ngo),
        isRestaurant = String(org._id) === String(claim.restaurant);
      if (!isNgo && !isRestaurant) throw new AppError(403, 'Permission denied');
      const target = isNgo ? claim.restaurant : claim.ngo;
      ok(
        res,
        await Feedback.create({
          ...data,
          claim: id,
          from: req.user._id,
          to: target,
        }),
        201,
      );
    }),
  );
  return r;
}
