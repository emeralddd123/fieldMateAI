import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const body =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const details =
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>)
        : {};
    if (status >= 500)
      this.logger.error(
        'Request failed',
        exception instanceof Error ? exception.stack : undefined,
      );
    response.status(status).json({
      error: {
        code:
          typeof details.code === 'string'
            ? details.code
            : status === 400
              ? 'VALIDATION_ERROR'
              : status === 404
                ? 'NOT_FOUND'
                : status >= 500
                  ? 'SERVICE_UNAVAILABLE'
                  : 'REQUEST_FAILED',
        message:
          status >= 500
            ? 'The maintenance service is unavailable. Please retry.'
            : Array.isArray(details.message)
              ? details.message.join('; ')
              : typeof details.message === 'string'
                ? details.message
                : typeof body === 'string'
                  ? body
                  : 'Request failed.',
      },
    });
  }
}
