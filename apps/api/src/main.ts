import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env } from './config/env';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { SerializationInterceptor } from './common/serialization.interceptor';
import { requestIdMiddleware } from './common/request-id.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', env.TRUST_PROXY ? 1 : false);
  app.use(helmet());
  app.use(requestIdMiddleware);
  app.use(cookieParser());
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) return callback(null, true);
      if (origin === new URL(env.FRONTEND_URL).origin)
        return callback(null, true);
      try {
        const u = new URL(origin);
        if (
          u.hostname === 'localhost' ||
          u.hostname === '127.0.0.1' ||
          u.hostname.startsWith('192.168.') ||
          u.hostname.startsWith('10.') ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)
        ) {
          return callback(null, true);
        }
      } catch {
        /* Malformed origins are rejected below. */
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  });
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new SerializationInterceptor());
  const logger = new Logger('HTTP');
  app.use((request: Request, response: Response, next: NextFunction) => {
    response.on('finish', () =>
      logger.log(
        `${request.headers['x-request-id']} ${request.method} ${request.path} ${response.statusCode}`,
      ),
    );
    next();
  });
  const config = new DocumentBuilder()
    .setTitle('FieldMate Industrial Intelligence API')
    .setDescription(
      'Role-based operations for equipment diagnostics, maintenance work orders, voice assistance, and multi-tenant administration.',
    )
    .setVersion('1.0.0')
    .addCookieAuth(
      env.SESSION_COOKIE_NAME,
      {
        type: 'apiKey',
        in: 'cookie',
        description:
          'Server-side session cookie authenticated via Argon2id hashed sessions.',
      },
      'fieldmate-session',
    )
    .addTag('auth', 'Authentication and session lifecycle endpoints')
    .addTag('admin-users', 'User, member, and site invitation administration')
    .addTag('admin-resources', 'Site and machine inventory administration')
    .addTag(
      'admin-knowledge',
      'Fault code diagnostics and procedure SOP administration',
    )
    .addTag(
      'admin-audit',
      'Immutable security audit trail and maintenance cleanup',
    )
    .addTag(
      'maintenance',
      'Equipment incidents, work orders, measurements, and repairs',
    )
    .addTag('voice', 'Voice intelligence session token and assistance tools')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap();
