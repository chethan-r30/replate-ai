// Redact credentials and tokens from structured request logs.
import pino from 'pino';
export const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      'token',
      'refreshToken',
      '*.passwordHash',
      '*.tokenHash',
    ],
    censor: '[REDACTED]',
  },
});
