// Validate configuration before connecting to any external service.
import { z } from 'zod';
const secret = z
  .string()
  .min(32)
  .refine((value) => !value.includes('REPLACE_ME'), 'replace the placeholder');
const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  CLIENT_URL: z.string().url(),
  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, 'provide a MongoDB connection string'),
  JWT_ACCESS_SECRET: secret,
  JWT_REFRESH_SECRET: secret,
  JWT_ACCESS_EXPIRES: z.literal('15m').default('15m'),
  JWT_REFRESH_EXPIRES: z.literal('7d').default('7d'),
  COOKIE_DOMAIN: z.string().default('localhost'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  REDIS_URL: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('ReplateAI <no-reply@example.com>'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  AI_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(20),
});
export function parseEnv(input) {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new Error(
      `Invalid environment: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
    );
  if (
    result.data.NODE_ENV === 'production' &&
    !result.data.CLIENT_URL.startsWith('https://')
  )
    throw new Error('CLIENT_URL must use HTTPS in production');
  return result.data;
}
export const hasKey = (value) =>
  Boolean(value && !value.includes('REPLACE_ME'));
