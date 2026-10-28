// Organization proof and admin approval are server-side gates, never client flags.
import { Router } from 'express';
import { z } from 'zod';
import { Organization } from '../models/Organization.js';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';
import {
  requireAuth,
  requireRole,
  objectId,
  pagination,
} from '../middleware/auth.js';
import { AppError, asyncRoute, ok } from '../middleware/errors.js';
export const organizationSchema = z
  .object({
    name: z.string().trim().min(2).max(150),
    registrationNo: z.string().trim().min(3).max(100),
    timezone: z.string().refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, 'Use an IANA timezone'),
    address: z.string().trim().min(5).max(500),
    location: z
      .object({
        type: z.literal('Point'),
        coordinates: z.tuple([
          z.number().min(-180).max(180),
          z.number().min(-90).max(90),
        ]),
      })
      .strict(),
    operatingHours: z
      .object({
        start: z.number().min(0).max(24),
        end: z.number().min(0).max(24),
      })
      .strict()
      .refine((x) => x.end > x.start, 'Closing time must follow opening time')
      .default({ start: 0, end: 24 }),
    capacity: z.number().int().min(1).max(100000).default(100),
    preferences: z
      .object({
        categories: z
          .array(z.enum(['cooked', 'bakery', 'produce', 'packaged', 'dairy']))
          .max(5),
        dietary: z
          .array(z.enum(['veg', 'vegan', 'halal', 'contains-nuts']))
          .max(4),
      })
      .strict()
      .default({ categories: [], dietary: [] }),
    verificationDocs: z.array(z.string().url().max(1000)).min(1).max(5),
  })
  .strict();
export function organizationRoutes(config) {
  const r = Router();
  r.use(requireAuth(config));
  r.post(
    '/',
    requireRole('restaurant', 'ngo'),
    asyncRoute(async (req, res) => {
      const data = organizationSchema.parse(req.body);
      const org = await Organization.create({
        ...data,
        owner: req.user._id,
        type: req.user.role,
      });
      ok(res, org, 201);
    }),
  );
  r.get(
    '/mine',
    asyncRoute(async (req, res) => {
      z.object({}).strict().parse(req.query);
      ok(res, await Organization.findOne({ owner: req.user._id }).lean());
    }),
  );
  r.get(
    '/',
    requireRole('admin'),
    asyncRoute(async (req, res) => {
      const { page, limit } = pagination.parse(req.query);
      ok(
        res,
        await Organization.find()
          .sort({ _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
      );
    }),
  );
  r.get(
    '/:id',
    asyncRoute(async (req, res) => {
      const id = objectId.parse(req.params.id);
      const org = await Organization.findById(id).lean();
      if (!org) throw new AppError(404, 'Organization not found');
      if (
        req.user.role !== 'admin' &&
        String(org.owner) !== String(req.user._id)
      )
        throw new AppError(403, 'Permission denied');
      ok(res, org);
    }),
  );
  r.patch(
    '/:id',
    requireRole('restaurant', 'ngo'),
    asyncRoute(async (req, res) => {
      const id = objectId.parse(req.params.id);
      const data = organizationSchema.partial().parse(req.body);
      if (Object.keys(data).length === 0)
        throw new AppError(400, 'No changes provided');
      const org = await Organization.findOneAndUpdate(
        { _id: id, owner: req.user._id },
        { $set: { ...data, verificationStatus: 'pending' } },
        { new: true },
      );
      if (!org) throw new AppError(404, 'Organization not found');
      await User.updateOne(
        { _id: req.user._id },
        { $set: { verificationStatus: 'pending' } },
      );
      ok(res, org);
    }),
  );
  r.post(
    '/:id/verify',
    requireRole('admin'),
    asyncRoute(async (req, res) => {
      const id = objectId.parse(req.params.id);
      const data = z
        .object({
          status: z.enum(['approved', 'rejected']),
          reason: z.string().trim().min(3).max(500),
        })
        .strict()
        .parse(req.body);
      const org = await Organization.findById(id);
      if (!org) throw new AppError(404, 'Organization not found');
      if (!org.registrationNo || !org.verificationDocs.length)
        throw new AppError(400, 'Verification details required');
      org.verificationStatus = data.status;
      await org.save();
      await User.updateOne(
        { _id: org.owner },
        { $set: { verificationStatus: data.status } },
      );
      await AuditLog.create({
        actor: req.user._id,
        action: `organization.${data.status}`,
        target: id,
        reason: data.reason,
      });
      ok(res, org);
    }),
  );
  return r;
}
