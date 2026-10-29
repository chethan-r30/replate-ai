// Decode and reencode bytes locally. No untrusted SVG, external fetch or local files.
import mongoose from 'mongoose';
import { ProofUpload, UploadBudget } from '../models/ProofUpload.js';
import { objectId, requireAuth, requireRole } from '../middleware/auth.js';
import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { AppError, asyncRoute, ok } from '../middleware/errors.js';
export const TOTAL_UPLOAD_BYTES = 50 * 1024 * 1024;
export const OWNER_UPLOAD_BYTES = 10 * 1024 * 1024;
let activeUploads = 0;
export function uploadRoutes(config) {
  const r = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
  });
  r.post(
    ['/', '/proof'],
    requireAuth(config),
    requireRole('restaurant', 'ngo'),
    (req, res, next) => {
      if (activeUploads >= 2)
        return next(new AppError(429, 'Image uploads busy; try again shortly'));
      activeUploads++;
      let released = false;
      const release = () => {
        if (!released) {
          activeUploads--;
          released = true;
        }
      };
      res.once('finish', release);
      res.once('close', release);
      next();
    },
    upload.single('file'),
    asyncRoute(async (req, res) => {
      if (!req.file) throw new AppError(400, 'File required');
      const type = await fileTypeFromBuffer(req.file.buffer);
      if (
        !type ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(type.mime)
      )
        throw new AppError(400, 'Only JPEG, PNG or WebP bytes are accepted');
      let bytes;
      try {
        bytes = await sharp(req.file.buffer, {
          limitInputPixels: 16000000,
          failOn: 'warning',
        })
          .rotate()
          .resize({
            width: 1600,
            height: 1600,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: 78 })
          .toBuffer();
      } catch {
        throw new AppError(
          400,
          'Image could not be safely decoded; choose another image under 16 megapixels',
        );
      }
      if (bytes.length > 1024 * 1024)
        throw new AppError(
          413,
          'Choose a simpler image; encoded limit is 1 MiB',
        );
      const ownerKey = `owner:${req.user._id}`;
      // Precreate unique budget rows outside the transaction; concurrent insert races are harmless.
      for (const key of ['global', ownerKey]) {
        try {
          await UploadBudget.updateOne(
            { _id: key },
            { $setOnInsert: { used: 0, count: 0 } },
            { upsert: true },
          );
        } catch (e) {
          if (e.code !== 11000) throw e;
        }
      }
      const kind = req.path === '/proof' ? 'proof' : 'photo';
      const asset = await mongoose.connection.transaction(async () => {
        for (const [key, cap] of [
          ['global', TOTAL_UPLOAD_BYTES],
          [ownerKey, OWNER_UPLOAD_BYTES],
        ]) {
          const updated = await UploadBudget.findOneAndUpdate(
            {
              _id: key,
              used: { $lte: cap - bytes.length },
              count: { $lt: key === 'global' ? 1000 : 20 },
            },
            { $inc: { used: bytes.length, count: 1 } },
            { new: true },
          );
          if (!updated)
            throw new AppError(
              409,
              'Demo image storage limit reached. Remove an unused upload or try later.',
            );
        }
        const [record] = await ProofUpload.create([
          { owner: req.user._id, kind, bytes, size: bytes.length },
        ]);
        return record;
      });
      const path = `/uploads/${kind}/${asset._id}`;
      ok(
        res,
        {
          url:
            kind === 'proof'
              ? path
              : new URL(`/api/v1${path}`, config.CLIENT_URL).toString(),
        },
        201,
      );
    }),
  );
  const deliver = (kind) =>
    asyncRoute(async (req, res) => {
      const id = objectId.parse(req.params.id);
      const record = await ProofUpload.findOne({
        _id: id,
        kind,
        revoked: false,
      }).select('+bytes');
      if (
        !record ||
        (kind === 'proof' &&
          req.user.role !== 'admin' &&
          String(record.owner) !== String(req.user._id))
      )
        throw new AppError(404, 'Image not found');
      res.set({
        'Content-Type': 'image/webp',
        'Cache-Control':
          kind === 'proof' ? 'private, no-store' : 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline; filename="replate-image.webp"',
      });
      res.send(record.bytes);
    });
  r.get('/photo/:id', deliver('photo'));
  r.get('/proof/:id', requireAuth(config), deliver('proof'));
  r.delete(
    '/:id',
    requireAuth(config),
    asyncRoute(async (req, res) => {
      const id = objectId.parse(req.params.id);
      const removed = await mongoose.connection.transaction(async () => {
        const record = await ProofUpload.findOneAndDelete({
          _id: id,
          owner: req.user._id,
        });
        if (!record) throw new AppError(404, 'Image not found');
        await UploadBudget.updateMany(
          { _id: { $in: ['global', `owner:${req.user._id}`] } },
          { $inc: { used: -record.size, count: -1 } },
        );
        return record;
      });
      ok(res, { deleted: Boolean(removed) });
    }),
  );
  return r;
}
