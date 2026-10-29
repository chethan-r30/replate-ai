// Sniff bytes before upload. Never serve untrusted SVG, HTML or local files.
import { ProofUpload } from '../models/ProofUpload.js';
import { objectId } from '../middleware/auth.js';
import { Router } from 'express';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { v2 as cloudinary } from 'cloudinary';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { hasKey } from '../config/env.js';
import { AppError, asyncRoute, ok } from '../middleware/errors.js';
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
    upload.single('file'),
    asyncRoute(async (req, res) => {
      if (!req.file) throw new AppError(400, 'File required');
      const type = await fileTypeFromBuffer(req.file.buffer);
      if (
        !type ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(type.mime)
      )
        throw new AppError(400, 'Only JPEG, PNG or WebP bytes are accepted');
      if (
        ![
          config.CLOUDINARY_CLOUD_NAME,
          config.CLOUDINARY_API_KEY,
          config.CLOUDINARY_API_SECRET,
        ].every(hasKey)
      )
        throw new AppError(
          503,
          'Image upload unavailable until Cloudinary is configured',
        );
      cloudinary.config({
        cloud_name: config.CLOUDINARY_CLOUD_NAME,
        api_key: config.CLOUDINARY_API_KEY,
        api_secret: config.CLOUDINARY_API_SECRET,
        secure: true,
      });
      const proof = req.path === '/proof';
      const result = await new Promise((resolve, reject) =>
        cloudinary.uploader
          .upload_stream(
            {
              folder: proof ? 'replate-proof' : 'replate',
              ...(proof ? { type: 'authenticated' } : {}),
              resource_type: 'image',
              format: 'webp',
              transformation: [
                { width: 1600, height: 1600, crop: 'limit' },
                { quality: 'auto' },
              ],
            },
            (error, data) => (error ? reject(error) : resolve(data)),
          )
          .end(req.file.buffer),
      );
      if (proof) {
        const record = await ProofUpload.create({
          owner: req.user._id,
          publicId: result.public_id,
        });
        ok(res, { url: `/uploads/proof/${record._id}` }, 201);
      } else ok(res, { url: result.secure_url }, 201);
    }),
  );
  r.get(
    '/proof/:id',
    requireAuth(config),
    asyncRoute(async (req, res) => {
      const id = objectId.parse(req.params.id);
      const record = await ProofUpload.findOne({
        _id: id,
        revoked: false,
      }).lean();
      if (
        !record ||
        (req.user.role !== 'admin' &&
          String(record.owner) !== String(req.user._id))
      )
        throw new AppError(404, 'Proof not found');
      cloudinary.config({
        cloud_name: config.CLOUDINARY_CLOUD_NAME,
        api_key: config.CLOUDINARY_API_KEY,
        api_secret: config.CLOUDINARY_API_SECRET,
        secure: true,
      });
      const url = cloudinary.url(record.publicId, {
        type: 'authenticated',
        resource_type: 'image',
        format: 'webp',
        sign_url: true,
        secure: true,
      });
      // Only fixed SDK-generated Cloudinary origins are fetched, never user URLs.
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      if (!response.ok) throw new AppError(502, 'Proof storage unavailable');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 10 * 1024 * 1024)
        throw new AppError(502, 'Proof exceeds delivery limit');
      res.set({
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'inline; filename="verification-proof.webp"',
        'X-Content-Type-Options': 'nosniff',
      });
      res.send(bytes);
    }),
  );
  return r;
}
