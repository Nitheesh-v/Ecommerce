import { z } from 'zod';

/**
 * Environment schema.
 *
 * Every variable the application reads at runtime is declared here once, so a
 * missing or malformed value fails fast at boot instead of surfacing later as a
 * confusing runtime error (for example `undefined` passed to `app.listen`).
 *
 * Add new variables here first, then to `.env.example`.
 */
/** Values that look like a secret but are not one. */
const DEFAULT_SECRET_PLACEHOLDERS = new Set([
  'changeme',
  'change-me',
  'secret',
  'your-secret',
  'your_jwt_secret',
  'replace-me',
  'development',
]);

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  /** HTTP port the Nest application binds to. */
  PORT: z.coerce.number().int().positive().max(65535).default(5000),

  /** MongoDB connection string (`mongodb://` or `mongodb+srv://`). */
  MONGODB_URI: z
    .string()
    .min(1, 'MONGODB_URI is required')
    .refine(
      (value) =>
        value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
      'MONGODB_URI must start with mongodb:// or mongodb+srv://',
    ),

  /**
   * Allowed browser origins for CORS, comma separated.
   * Example: `http://localhost:3000,https://shop.example.com`
   */
  FRONTEND_URL: z.string().min(1).default('http://localhost:3000'),

  /** Expose Swagger UI at `/api/docs`. Defaults to on outside production. */
  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === undefined ? undefined : value === 'true'),

  /**
   * Secret used to sign access tokens. Required: a missing or short secret must
   * stop the process, never fall back to a default.
   */
  JWT_ACCESS_SECRET: z
    .string()
    .min(
      32,
      'JWT_ACCESS_SECRET must be at least 32 characters. Generate one with: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    )
    .refine(
      (value) => !DEFAULT_SECRET_PLACEHOLDERS.has(value.toLowerCase()),
      'JWT_ACCESS_SECRET must not be a placeholder value',
    ),

  /** Access token lifetime. */
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),

  /** Refresh-session lifetime (the refresh token itself is opaque, not a JWT). */
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  /** bcrypt cost factor. 12 is a sensible production default. */
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  /** Rate limit window in seconds. */
  THROTTLE_TTL: z.coerce.number().int().positive().default(60),

  /** Maximum requests per IP per window on throttled routes. */
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Shape returned by {@link validateEnv}. `ConfigService.get()` is typed against
 * this interface via the `ConfigService<Env, true>` generic.
 */
export interface ValidatedEnv {
  NODE_ENV: Env['NODE_ENV'];
  PORT: number;
  MONGODB_URI: string;
  FRONTEND_URL: string;
  SWAGGER_ENABLED?: boolean;
  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  BCRYPT_ROUNDS: number;
  THROTTLE_TTL: number;
  THROTTLE_LIMIT: number;
}

/**
 * `ConfigModule.forRoot({ validate })` hook.
 *
 * Receives the merged `process.env` + `.env` values and returns the parsed,
 * defaulted configuration. Throws a readable, aggregated error when invalid.
 */
export function validateEnv(config: Record<string, unknown>): ValidatedEnv {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const env = result.data;

  return {
    NODE_ENV: env.NODE_ENV,
    PORT: env.PORT,
    MONGODB_URI: env.MONGODB_URI,
    FRONTEND_URL: env.FRONTEND_URL,
    SWAGGER_ENABLED: env.SWAGGER_ENABLED,
    JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET,
    JWT_ACCESS_EXPIRES_IN: env.JWT_ACCESS_EXPIRES_IN,
    JWT_REFRESH_EXPIRES_IN: env.JWT_REFRESH_EXPIRES_IN,
    BCRYPT_ROUNDS: env.BCRYPT_ROUNDS,
    THROTTLE_TTL: env.THROTTLE_TTL,
    THROTTLE_LIMIT: env.THROTTLE_LIMIT,
  };
}
