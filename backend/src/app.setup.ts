import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { requestIdMiddleware } from './common/middleware/request-id.middleware.js';
import type { ValidatedEnv } from './config/env.validation.js';

export interface ConfigureAppOptions {
  /** Mount Swagger UI (still subject to `SWAGGER_ENABLED`). */
  swagger?: boolean;
  /** Apply the CORS allow-list. */
  cors?: boolean;
  /** Apply security headers. */
  security?: boolean;
}

const SWAGGER_PATH = 'api/docs';

/**
 * Everything that must be applied to the raw `INestApplication` and therefore
 * cannot live in the DI container: global prefix, body/cookie parsing, security
 * headers, CORS and Swagger.
 *
 * `main.ts` and the e2e tests both call this, so what is tested is what ships.
 */
export function configureApp(
  app: INestApplication,
  configService: ConfigService<ValidatedEnv, true>,
  options: ConfigureAppOptions = {},
): void {
  const { swagger = true, cors = true, security = true } = options;

  app.setGlobalPrefix('api');

  // Correlation first: every subsequent log line and error body can reference it.
  app.use(requestIdMiddleware);
  app.use(cookieParser());

  if (security) {
    app.use(securityHeaders());
  }

  if (cors) {
    const allowedOrigins = configService
      .get('FRONTEND_URL', { infer: true })
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    app.enableCors({
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
      exposedHeaders: ['x-request-id'],
      maxAge: 86_400,
    });
  }

  const nodeEnv = configService.get('NODE_ENV', { infer: true });
  const swaggerEnabled =
    configService.get('SWAGGER_ENABLED', { infer: true }) ?? nodeEnv !== 'production';

  if (swagger && swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('E-commerce API')
        .setDescription(
          'Single-vendor e-commerce API. Responses use the envelope `{ success, data, meta? }`; errors use `{ success: false, statusCode, error, message, details?, path, timestamp, requestId }`.',
        )
        .setVersion('1.0')
        .addBearerAuth()
        .addCookieAuth('refresh_token')
        .build(),
    );

    SwaggerModule.setup(SWAGGER_PATH, app, document);
  }

  app.enableShutdownHooks();
}

/**
 * Helmet with sane API defaults.
 *
 * Swagger UI is server-rendered HTML that needs inline styles/scripts, so the
 * docs routes are exempt instead of weakening CSP for the entire API.
 */
function securityHeaders() {
  const helmetMiddleware = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
  });

  return (req: Request, res: Response, next: NextFunction): void => {
    const isDocs = req.path.startsWith(`/${SWAGGER_PATH}`);

    if (isDocs) {
      next();

      return;
    }

    helmetMiddleware(req, res, next);
  };
}
