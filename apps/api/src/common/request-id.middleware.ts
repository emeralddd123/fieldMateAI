import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const safeRequestId = /^[A-Za-z0-9._-]{1,100}$/;

export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const supplied = request.header('x-request-id');
  const requestId =
    supplied && safeRequestId.test(supplied) ? supplied : randomUUID();
  request.headers['x-request-id'] = requestId;
  response.setHeader('x-request-id', requestId);
  next();
}
