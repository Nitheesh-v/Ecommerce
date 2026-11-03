import { validateEnv } from './env.validation.js';

const baseEnv = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/ecommerce',
  JWT_ACCESS_SECRET: 'a-development-secret-that-is-long-enough',
};

describe('validateEnv', () => {
  it('applies defaults for optional variables', () => {
    const env = validateEnv({ ...baseEnv });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(5000);
    expect(env.FRONTEND_URL).toBe('http://localhost:3000');
    expect(env.JWT_ACCESS_EXPIRES_IN).toBe('15m');
  });

  it('coerces PORT from a string to a number', () => {
    const env = validateEnv({ ...baseEnv, PORT: '8080' });

    expect(env.PORT).toBe(8080);
    expect(typeof env.PORT).toBe('number');
  });

  it('accepts a mongodb+srv connection string', () => {
    const env = validateEnv({
      ...baseEnv,
      MONGODB_URI: 'mongodb+srv://user:pass@cluster0.example.mongodb.net/shop',
    });

    expect(env.MONGODB_URI).toContain('mongodb+srv://');
  });

  it('rejects a missing MONGODB_URI', () => {
    expect(() => validateEnv({})).toThrow(/MONGODB_URI/);
  });

  it('rejects a MONGODB_URI with an unsupported scheme', () => {
    expect(() =>
      validateEnv({ ...baseEnv, MONGODB_URI: 'postgres://127.0.0.1:5432/shop' }),
    ).toThrow(/mongodb:\/\/ or mongodb\+srv:\/\//);
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => validateEnv({ ...baseEnv, PORT: 'not-a-port' })).toThrow(/PORT/);
  });

  it('rejects an unsupported NODE_ENV', () => {
    expect(() => validateEnv({ ...baseEnv, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('requires JWT_ACCESS_SECRET and rejects weak values', () => {
    expect(() => validateEnv({ MONGODB_URI: baseEnv.MONGODB_URI })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
    expect(() =>
      validateEnv({ ...baseEnv, JWT_ACCESS_SECRET: 'too-short' }),
    ).toThrow(/at least 32 characters/);
    expect(() =>
      validateEnv({ ...baseEnv, JWT_ACCESS_SECRET: 'changeme' }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('bounds the bcrypt cost factor', () => {
    expect(validateEnv({ ...baseEnv }).BCRYPT_ROUNDS).toBe(12);
    expect(validateEnv({ ...baseEnv, BCRYPT_ROUNDS: '10' }).BCRYPT_ROUNDS).toBe(10);
    expect(() => validateEnv({ ...baseEnv, BCRYPT_ROUNDS: '3' })).toThrow(
      /BCRYPT_ROUNDS/,
    );
  });

  it('parses SWAGGER_ENABLED into a boolean', () => {
    expect(validateEnv({ ...baseEnv, SWAGGER_ENABLED: 'false' }).SWAGGER_ENABLED).toBe(
      false,
    );
    expect(validateEnv({ ...baseEnv }).SWAGGER_ENABLED).toBeUndefined();
  });
});
