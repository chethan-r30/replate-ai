import swaggerUi from 'swagger-ui-express';
import { openapi } from './openapi.js';
import { profile } from './lib/profile.js';
// Compose security middleware and versioned API routes without opening a port.
import express from 'express';
import {
  analyticsRoutes,
  notificationRoutes,
  adminRoutes,
} from './routes/analytics.js';
import { aiRoutes } from './routes/ai.js';
import { listingRoutes } from './routes/listings.js';
import { claimRoutes } from './routes/claims.js';
import { uploadRoutes } from './routes/uploads.js';
import cookieParser from 'cookie-parser';
import { authRoutes } from './routes/auth.js';
import { organizationRoutes } from './routes/organizations.js';
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
  if (process.env.PROFILE_DB)
    app.use((req, res, next) => {
      req.profileStart = performance.now();
      if (req.method === 'POST' && req.path === '/api/v1/claims')
        res.once('finish', () =>
          profile('claim-total', performance.now() - req.profileStart),
        );
      next();
    });
  app.disable('x-powered-by');
  app.set('trust proxy', config.NODE_ENV === 'production' ? 1 : false);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
    }),
  );
  app.use((req, _res, next) => {
    if (config.NODE_ENV === 'production' && !req.secure)
      return next(new AppError(400, 'HTTPS required'));
    if (req.headers.origin && req.headers.origin !== config.CLIENT_URL)
      return next(new AppError(403, 'Origin not allowed'));
    next();
  });
  app.use(cors({ origin: config.CLIENT_URL, credentials: true }));
  app.use(compression());
  app.use(
    pinoHttp({
      logger,
      autoLogging: config.NODE_ENV !== 'test',
      serializers: {
        req: (req) => ({
          method: req.method,
          path: req.url?.split('?')[0],
          remoteAddress: req.remoteAddress,
        }),
      },
    }),
  );
  app.use(
    rateLimit({
      // Provider probes run every5seconds; counting them can mark a healthy API down.
      skip: (req) =>
        req.method === 'GET' &&
        ['/api/v1/health', '/api/v1/ready'].includes(req.path),
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      limit: config.RATE_LIMIT_MAX,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (_req, _res, next) =>
        next(new AppError(429, 'Too many requests')),
    }),
  );
  app.use(express.json({ limit: '7mb' }));
  app.use(
    mongoSanitize({
      onSanitize: () => {
        throw new AppError(400, 'MongoDB operators are not accepted');
      },
    }),
  );
  app.use(hpp());
  app.use(cookieParser());
  app.use(
    '/api/v1/auth',
    (_req, res, next) => {
      res.set('Cache-Control', 'private, no-store');
      next();
    },
    authRoutes(config),
  );
  app.use('/api/v1/organizations', organizationRoutes(config));
  app.get('/api/v1/health', (req, res) => {
    z.object({}).strict().parse(req.query);
    ok(res, { status: 'up', version: '0.1.0' });
  });
  app.get('/api/v1/ready', (req, res) => {
    z.object({}).strict().parse(req.query);
    if (!databaseReady()) throw new AppError(503, 'Database is not ready');
    ok(res, { status: 'ready' });
  });
  app.use('/api/v1/listings', listingRoutes(config));
  app.use('/api/v1/claims', claimRoutes(config));
  app.use('/api/v1/uploads', uploadRoutes(config));
  app.use('/api/v1/ai', aiRoutes(config));
  app.use('/api/v1/analytics', analyticsRoutes(config));
  app.use('/api/v1/notifications', notificationRoutes(config));
  app.use('/api/v1/admin', adminRoutes(config));
  app.get('/api/openapi.json', (_req, res) => res.json(openapi));
  // Docs load only local assets, with no credential persistence or mutation UI.
  app.use(
    '/api/docs',
    helmet.contentSecurityPolicy({
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    }),
    swaggerUi.serve,
    swaggerUi.setup(openapi, {
      swaggerOptions: {
        supportedSubmitMethods: [],
        persistAuthorization: false,
      },
      customSiteTitle: 'ReplateAI API reference',
    }),
  );
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
