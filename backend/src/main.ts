import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import type { ValidatedEnv } from './config/env.validation.js';

const logger = new Logger('Bootstrap');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get<ConfigService<ValidatedEnv, true>>(ConfigService);

  const nodeEnv = configService.get('NODE_ENV', { infer: true });
  const port = configService.get('PORT', { infer: true });
  const swaggerEnabled =
    configService.get('SWAGGER_ENABLED', { infer: true }) ?? nodeEnv !== 'production';

  // Every route is served under /api unless it opts out with @Public()-style
  // exclusions (added in later phases).
  app.setGlobalPrefix('api');

  const allowedOrigins = configService
    .get('FRONTEND_URL', { infer: true })
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  if (swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('E-commerce API')
        .setDescription('Single-vendor e-commerce backend API')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );

    SwaggerModule.setup('api/docs', app, document);
  }

  // Let Nest run onModuleDestroy/onApplicationShutdown for graceful shutdown.
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');

  logger.log(`API listening on http://localhost:${port}/api (${nodeEnv})`);
  if (swaggerEnabled) {
    logger.log(`Swagger UI at http://localhost:${port}/api/docs`);
  }
}

try {
  await bootstrap();
} catch (error) {
  logger.error(
    `Application failed to start: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
