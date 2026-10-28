// Compose security middleware and versioned API routes without opening a port.
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import pinoHttp from 'pino-http';
import { z } from 'zod';
import { logger } from './lib/logger.js';
import { databaseReady } from './config/database.js';
import { AppError, errorHandler, notFound, ok } from './middleware/errors.js';
export function createApp(config) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.NODE_ENV === 'production' ? 1 : false);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
    }),
  );
  app.use(cors({ origin: config.CLIENT_URL, credentials: true }));
  app.use(compression());
  app.use(pinoHttp({ logger, autoLogging: config.NODE_ENV !== 'test' }));
  app.use(
    rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      limit: config.RATE_LIMIT_MAX,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (_req, _res, next) =>
        next(new AppError(429, 'Too many requests')),
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(
    mongoSanitize({
      onSanitize: () => {
        throw new AppError(400, 'MongoDB operators are not accepted');
      },
    }),
  );
  app.use(hpp());
  app.get('/api/v1/health', (req, res) => {
    z.object({}).strict().parse(req.query);
    ok(res, { status: 'up', version: '0.1.0' });
  });
  app.get('/api/v1/ready', (req, res) => {
    z.object({}).strict().parse(req.query);
    if (!databaseReady()) throw new AppError(503, 'Database is not ready');
    ok(res, { status: 'ready' });
  });
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
