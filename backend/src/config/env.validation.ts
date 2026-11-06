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

  /** Where locally-stored product images are written, relative to the process cwd. */
  UPLOAD_DIR: z.string().min(1).default('uploads'),

  /**
   * Optional Cloudinary credentials. Set **all three** to upload images to the
   * CDN; leave them empty to store images on local disk instead.
   */
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),

  /**
   * Optional Razorpay credentials. Set **all three** to enable online payments;
   * leave them empty to run the store without a gateway (admin payment views keep
   * working, checkout answers 503). A partially-filled set aborts boot.
   *
   * `RAZORPAY_KEY_ID` is public (it is handed to the checkout widget), the other
   * two are server-only secrets and must never reach the browser or a log line.
   * Test-mode keys start with `rzp_test_`.
   */
  RAZORPAY_KEY_ID: z
    .string()
    .min(1)
    .regex(/^rzp_(test|live)_[A-Za-z0-9]+$/, 'RAZORPAY_KEY_ID must look like rzp_test_… or rzp_live_…')
    .optional(),
  RAZORPAY_KEY_SECRET: z.string().min(8).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(8).optional(),

  /**
   * Optional courier integration credentials (Shipping, phase 8).
   *
   * None of these are required: the store ships through the **manual** courier
   * workflow (assign a partner, type the AWB, update the parcel status). A provider
   * becomes selectable only when its credentials exist; until then selecting it is
   * a 503 that names the missing variables. Never fake tracking updates.
   *
   * Each provider's variables must be set together (or all left empty).
   */
  SHIPROCKET_EMAIL: z.string().email().optional(),
  SHIPROCKET_PASSWORD: z.string().min(4).optional(),
  /**
   * Optional outbound email (Notifications, phase 18).
   *
   * Nothing here is required: with no SMTP the store still records every
   * notification in-app and marks its email half `skipped`. When `SMTP_HOST` is
   * set, `MAIL_FROM` must be too — an SMTP client with no envelope sender is a
   * configuration bug that would only surface at the first real send.
   */
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  MAIL_FROM: z.string().email().optional(),

  DELHIVERY_API_TOKEN: z.string().min(8).optional(),
  BLUEDART_API_KEY: z.string().min(4).optional(),
  BLUEDART_LICENCE_KEY: z.string().min(4).optional(),
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
  UPLOAD_DIR: string;
  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
  SHIPROCKET_EMAIL?: string;
  SHIPROCKET_PASSWORD?: string;
  DELHIVERY_API_TOKEN?: string;
  BLUEDART_API_KEY?: string;
  BLUEDART_LICENCE_KEY?: string;
  SMTP_HOST?: string;
  SMTP_PORT: number;
  SMTP_SECURE?: boolean;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  MAIL_FROM?: string;
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

  // A half-configured CDN is almost always a copy/paste mistake; failing loudly
  // here beats discovering it when the first upload 503s.
  const cloudinaryValues = [
    env.CLOUDINARY_CLOUD_NAME,
    env.CLOUDINARY_API_KEY,
    env.CLOUDINARY_API_SECRET,
  ];
  const configuredCloudinary = cloudinaryValues.filter(Boolean).length;

  if (configuredCloudinary !== 0 && configuredCloudinary !== 3) {
    throw new Error(
      'Invalid environment configuration:\n  - CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET must be set together (or all left empty to store images locally)',
    );
  }

  // Same reasoning for the gateway: half a Razorpay configuration would produce a
  // checkout that opens and then fails every verification.
  const razorpayValues = [
    env.RAZORPAY_KEY_ID,
    env.RAZORPAY_KEY_SECRET,
    env.RAZORPAY_WEBHOOK_SECRET,
  ];
  const configuredRazorpay = razorpayValues.filter(Boolean).length;

  if (configuredRazorpay !== 0 && configuredRazorpay !== 3) {
    throw new Error(
      'Invalid environment configuration:\n  - RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET must be set together (or all left empty to disable online payments)',
    );
  }

  // A half-configured mail server would fail at the first customer email instead
  // of at boot, where it can actually be fixed.
  if (env.SMTP_HOST && !env.MAIL_FROM) {
    throw new Error(
      'Invalid environment configuration:\n  - MAIL_FROM is required when SMTP_HOST is set (it is the envelope sender)',
    );
  }
  if ((env.SMTP_USER && !env.SMTP_PASSWORD) || (!env.SMTP_USER && env.SMTP_PASSWORD)) {
    throw new Error(
      'Invalid environment configuration:\n  - SMTP_USER and SMTP_PASSWORD must be set together (or both left empty for an open relay)',
    );
  }

  // A half-configured courier would advertise an integration that cannot book a
  // parcel; fail at boot with the exact pair that is wrong.
  for (const [label, pair] of [
    ['SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD', [env.SHIPROCKET_EMAIL, env.SHIPROCKET_PASSWORD]],
    ['BLUEDART_API_KEY / BLUEDART_LICENCE_KEY', [env.BLUEDART_API_KEY, env.BLUEDART_LICENCE_KEY]],
  ] as const) {
    const configured = pair.filter(Boolean).length;

    if (configured !== 0 && configured !== pair.length) {
      throw new Error(
        `Invalid environment configuration:\n  - ${label} must be set together (or both left empty to keep that courier disabled)`,
      );
    }
  }

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
    UPLOAD_DIR: env.UPLOAD_DIR,
    CLOUDINARY_CLOUD_NAME: env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: env.CLOUDINARY_API_SECRET,
    RAZORPAY_KEY_ID: env.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: env.RAZORPAY_KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET: env.RAZORPAY_WEBHOOK_SECRET,
    SHIPROCKET_EMAIL: env.SHIPROCKET_EMAIL,
    SHIPROCKET_PASSWORD: env.SHIPROCKET_PASSWORD,
    DELHIVERY_API_TOKEN: env.DELHIVERY_API_TOKEN,
    BLUEDART_API_KEY: env.BLUEDART_API_KEY,
    BLUEDART_LICENCE_KEY: env.BLUEDART_LICENCE_KEY,
    SMTP_HOST: env.SMTP_HOST,
    SMTP_PORT: env.SMTP_PORT,
    SMTP_SECURE: env.SMTP_SECURE,
    SMTP_USER: env.SMTP_USER,
    SMTP_PASSWORD: env.SMTP_PASSWORD,
    MAIL_FROM: env.MAIL_FROM,
  };
}
