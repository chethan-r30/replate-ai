// Sniff bytes before upload. Never serve untrusted SVG, HTML or local files.
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
    '/',
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
      const result = await new Promise((resolve, reject) =>
        cloudinary.uploader
          .upload_stream(
            {
              folder: 'replate',
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
      ok(res, { url: result.secure_url }, 201);
    }),
  );
  return r;
}
