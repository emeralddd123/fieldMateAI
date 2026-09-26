import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url().refine((value) => /^postgres(ql)?:\/\//.test(value)),
  FRONTEND_URL: z.url().default('http://localhost:5173'),
  ASSEMBLYAI_API_KEY: z.string().trim().default(''),
  ASSEMBLYAI_VOICE: z.string().trim().min(1).default('alba'),
});

export const env = schema.parse(process.env);
