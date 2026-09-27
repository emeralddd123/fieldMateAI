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
    origin: new URL(env.FRONTEND_URL).origin,
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
    .setTitle('FieldMate API')
    .setDescription('Equipment context and maintenance operations.')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap();
