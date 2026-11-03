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

  /** Access token lifetime (used from Phase 4 onwards). */
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),

  /** Refresh token lifetime (used from Phase 4 onwards). */
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
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
  JWT_ACCESS_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
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
    JWT_ACCESS_EXPIRES_IN: env.JWT_ACCESS_EXPIRES_IN,
    JWT_REFRESH_EXPIRES_IN: env.JWT_REFRESH_EXPIRES_IN,
  };
}
