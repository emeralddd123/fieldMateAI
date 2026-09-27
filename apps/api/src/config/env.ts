import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url().refine((value) => /^postgres(ql)?:\/\//.test(value)),
  FRONTEND_URL: z.url().default('http://localhost:5173'),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  SESSION_COOKIE_NAME: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .default('fieldmate_session'),
  SESSION_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(168),
  API_RATE_LIMIT_TTL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(3_600_000)
    .default(60_000),
  API_RATE_LIMIT_MAX: z.coerce.number().int().min(10).max(10_000).default(300),
  AUTH_RATE_LIMIT_TTL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(3_600_000)
    .default(60_000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(10),
  INVITE_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(72),
  PASSWORD_RESET_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .default(30),
  AUTH_RETURN_RESET_TOKEN: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  BOOTSTRAP_ADMIN_EMAIL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .email()
      .transform((value) => value.trim().toLowerCase())
      .optional(),
  ),
  BOOTSTRAP_ADMIN_PASSWORD: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(12).max(128).optional(),
  ),
  DEMO_USER_PASSWORD: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(12).max(128).optional(),
  ),
  ASSEMBLYAI_API_KEY: z.string().trim().default(''),
  ASSEMBLYAI_VOICE: z.string().trim().min(1).default('alba'),
});

export const env = schema.parse(process.env);
