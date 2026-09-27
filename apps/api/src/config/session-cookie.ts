import type { CookieOptions } from 'express';
import { env } from './env';

export const sessionCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: new URL(env.FRONTEND_URL).protocol === 'https:',
  sameSite: 'lax',
  path: '/',
  maxAge: env.SESSION_TTL_HOURS * 60 * 60 * 1000,
};

export const clearSessionCookieOptions: CookieOptions = {
  httpOnly: sessionCookieOptions.httpOnly,
  secure: sessionCookieOptions.secure,
  sameSite: sessionCookieOptions.sameSite,
  path: sessionCookieOptions.path,
  maxAge: 0,
};
