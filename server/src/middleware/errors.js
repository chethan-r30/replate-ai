// Give every API failure the same public shape without leaking internal details.
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';
export class AppError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}
export function notFound(_req, _res, next) {
  next(new AppError(404, 'Not found'));
}
export function errorHandler(error, _req, res, _next) {
  let status = error instanceof ZodError ? 400 : error.status || 500;
  let message = error instanceof ZodError ? 'Validation failed' : error.message;
  if (error.code === 11000) {
    status = 409;
    message = 'This record already exists';
  }
  if (error.name === 'CastError') {
    status = 400;
    message = 'Invalid identifier';
  }
  if (status >= 500) {
    logger.error({ name: error.name }, 'Request failed');
    message = 'Internal server error';
  }
  res.status(status).json({
    success: false,
    message,
    ...(error instanceof ZodError
      ? {
          errors: error.issues.map(({ path, message }) => ({
            path: path.join('.'),
            message,
          })),
        }
      : error.errors
        ? { errors: error.errors }
        : {}),
  });
}
export const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
export const ok = (res, data, status = 200) =>
  res.status(status).json({ success: true, message: 'OK', data });
