import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { ValidatedEnv } from './config/env.validation.js';

const logger = new Logger('Bootstrap');

async function bootstrap(): Promise<void> {
  // `rawBody` keeps the exact request bytes available (`req.rawBody`) for the one
  // route that needs them: gateway webhooks, whose HMAC is computed over the body
  // as sent. Parsing the JSON first and re-serialising would change the bytes and
  // break every signature.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get<ConfigService<ValidatedEnv, true>>(ConfigService);

  configureApp(app, configService);

  const nodeEnv = configService.get('NODE_ENV', { infer: true });
  const port = configService.get('PORT', { infer: true });
  const swaggerEnabled =
    configService.get('SWAGGER_ENABLED', { infer: true }) ?? nodeEnv !== 'production';

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
