import type { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { Role } from '../src/common/enums/role.enum.js';
import { createTestApp } from './support/create-test-app.js';
import { InMemorySessionsRepository } from './support/in-memory-sessions.repository.js';
import { InMemoryUsersRepository } from './support/in-memory-users.repository.js';
import { HardeningTestModule } from './support/hardening-test.module.js';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/ecommerce-test';
  process.env.JWT_ACCESS_SECRET = 'integration-test-secret-value-32-chars-min';
  process.env.JWT_ACCESS_EXPIRES_IN = '15m';
  process.env.JWT_REFRESH_EXPIRES_IN = '7d';
  // Cost 4 keeps bcrypt fast in tests; the production default is 12.
  process.env.BCRYPT_ROUNDS = '4';
});

const CUSTOMER = {
  email: 'customer@example.com',
  password: 'Str0ngPassw0rd',
  firstName: 'Nitheesh',
  lastName: 'V',
};

const ADMIN = {
  email: 'owner@example.com',
  password: 'Adm1nPassw0rd',
  firstName: 'Store',
  lastName: 'Owner',
};

interface SessionResponse {
  body: {
    success: boolean;
    data: { accessToken: string; tokenType: string; user: Record<string, unknown> };
  };
  headers: Record<string, string | string[]>;
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let users: InMemoryUsersRepository;
  let sessions: InMemorySessionsRepository;

  const server = () => app.getHttpServer();

  function refreshCookieOf(response: { headers: Record<string, string | string[]> }) {
    const setCookie = response.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie : [];
    const cookie = cookies.find((entry) => entry.startsWith('refresh_token='));

    if (!cookie) {
      throw new Error('refresh_token cookie not set');
    }

    // Strip attributes so the value can be replayed as a request cookie.
    return cookie.split(';')[0];
  }

  beforeAll(async () => {
    users = new InMemoryUsersRepository();
    sessions = new InMemorySessionsRepository();

    // Seed the single store owner directly (the real project uses `npm run seed:admin`).
    users.seed({
      email: ADMIN.email,
      passwordHash: await bcrypt.hash(ADMIN.password, 4),
      firstName: ADMIN.firstName,
      lastName: ADMIN.lastName,
      role: Role.Admin,
      isActive: true,
    });

    app = await createTestApp({
      imports: [HardeningTestModule],
      users,
      sessions,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('registration', () => {
    let registerResponse: SessionResponse;

    it('creates an account, returns an access token and sets an HttpOnly cookie', async () => {
      registerResponse = (await request(server())
        .post('/api/auth/register')
        .send(CUSTOMER)
        .expect(201)) as unknown as SessionResponse;

      const { body, headers } = registerResponse;

      expect(body.success).toBe(true);
      expect(body.data.accessToken).toEqual(expect.any(String));
      expect(body.data.tokenType).toBe('Bearer');
      expect(body.data.user).toMatchObject({
        email: CUSTOMER.email,
        firstName: CUSTOMER.firstName,
        role: Role.Customer,
      });
      expect(body.data.user).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(body)).not.toContain('passwordHash');

      // The refresh token never appears in the body — only in the cookie.
      expect(JSON.stringify(body)).not.toContain('refreshToken');

      const rawCookie = ([] as string[])
        .concat(headers['set-cookie'] ?? [])
        .find((entry) => entry.startsWith('refresh_token='));

      expect(rawCookie).toBeDefined();
      expect(rawCookie).toContain('HttpOnly');
      expect(rawCookie).toContain('Path=/api/auth');
      expect(rawCookie).toContain('SameSite=Lax');
      // Not Secure in test (HTTP); it is Secure in production.
      expect(rawCookie).not.toContain('Secure');
    });

    it('stores only a hash of the password and of the refresh token', async () => {
      const stored = await users.findByEmail(CUSTOMER.email);

      expect(stored?.passwordHash).not.toBe(CUSTOMER.password);
      expect(stored?.passwordHash.startsWith('$2')).toBe(true);

      const cookie = refreshCookieOf(registerResponse);
      const token = cookie.replace('refresh_token=', '');
      const session = await sessions.findByTokenHash(token);

      // The raw token is not a key in the store.
      expect(session).toBeNull();
    });

    it('rejects a duplicate email with 409', async () => {
      const response = await request(server())
        .post('/api/auth/register')
        .send(CUSTOMER)
        .expect(409);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 409,
        message: 'An account with this email already exists',
      });
    });

    it('rejects a weak password with a validation error', async () => {
      const response = await request(server())
        .post('/api/auth/register')
        .send({ ...CUSTOMER, email: 'weak@example.com', password: 'abcdefgh' })
        .expect(400);

      expect(response.body.message).toBe('Validation failed');
      expect(response.body.details).toEqual(
        expect.arrayContaining([expect.stringContaining('number')]),
      );
    });
  });

  describe('login', () => {
    it('rejects a wrong password with the same message as an unknown email', async () => {
      const wrongPassword = await request(server())
        .post('/api/auth/login')
        .send({ email: CUSTOMER.email, password: 'Wr0ngPassword' })
        .expect(401);

      const unknownEmail = await request(server())
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'Wr0ngPassword' })
        .expect(401);

      expect(wrongPassword.body.message).toBe('Invalid email or password');
      expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
    });

    it('signs in an existing customer', async () => {
      const response = await request(server())
        .post('/api/auth/login')
        .send({ email: CUSTOMER.email, password: CUSTOMER.password })
        .expect(200);

      expect(response.body.data.user.email).toBe(CUSTOMER.email);
      expect(response.body.data.accessToken).toEqual(expect.any(String));
    });
  });

  describe('access control', () => {
    let accessToken: string;

    beforeAll(async () => {
      const response = await request(server())
        .post('/api/auth/login')
        .send({ email: CUSTOMER.email, password: CUSTOMER.password })
        .expect(200);

      accessToken = response.body.data.accessToken;
    });

    it('returns the current user for a valid token', async () => {
      const response = await request(server())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        email: CUSTOMER.email,
        role: Role.Customer,
      });
    });

    it('rejects a protected route without a token', async () => {
      const response = await request(server()).get('/api/auth/me').expect(401);

      expect(response.body.message).toBe('Authentication required');
    });

    it('rejects a malformed token', async () => {
      await request(server())
        .get('/api/auth/me')
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(401);
    });

    it('lets a customer through authentication but blocks the admin route', async () => {
      const response = await request(server())
        .get('/api/admin-probe')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 403,
        message: 'You do not have permission to access this resource',
      });
    });

    it('allows the admin through the admin route', async () => {
      const login = await request(server())
        .post('/api/auth/login')
        .send({ email: ADMIN.email, password: ADMIN.password })
        .expect(200);

      const response = await request(server())
        .get('/api/admin-probe')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`)
        .expect(200);

      expect(response.body.data).toMatchObject({ ok: true, role: Role.Admin });
    });

    it('keeps public routes reachable without a token', async () => {
      await request(server()).get('/api/health').expect(200);
    });
  });

  describe('refresh token rotation', () => {
    it('rotates the token and invalidates the previous one', async () => {
      const login = await request(server())
        .post('/api/auth/login')
        .send({ email: CUSTOMER.email, password: CUSTOMER.password })
        .expect(200);

      const firstCookie = refreshCookieOf(login);

      const rotated = await request(server())
        .post('/api/auth/refresh')
        .set('Cookie', firstCookie)
        .expect(200);

      const secondCookie = refreshCookieOf(rotated);
      expect(secondCookie).not.toBe(firstCookie);
      expect(rotated.body.data.accessToken).toEqual(expect.any(String));

      // Replaying the old token is treated as theft: 401 and every session dies.
      await request(server())
        .post('/api/auth/refresh')
        .set('Cookie', firstCookie)
        .expect(401);

      await request(server())
        .post('/api/auth/refresh')
        .set('Cookie', secondCookie)
        .expect(401);
    });

    it('rejects a refresh without a cookie', async () => {
      const response = await request(server()).post('/api/auth/refresh').expect(401);

      expect(response.body.message).toBe('Missing refresh token');
    });

    it('rejects a forged token', async () => {
      await request(server())
        .post('/api/auth/refresh')
        .set('Cookie', 'refresh_token=forged-token-value')
        .expect(401);
    });
  });

  describe('logout', () => {
    it('revokes the session and clears the cookie', async () => {
      const login = await request(server())
        .post('/api/auth/login')
        .send({ email: CUSTOMER.email, password: CUSTOMER.password })
        .expect(200);

      const cookie = refreshCookieOf(login);

      const logout = await request(server())
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .expect(204);

      const cleared = ([] as string[]).concat(logout.headers['set-cookie'] ?? []);
      expect(cleared.join(';')).toContain('refresh_token=;');

      await request(server())
        .post('/api/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
    });

    it('revokes every session on logout-all', async () => {
      const login = await request(server())
        .post('/api/auth/login')
        .send({ email: CUSTOMER.email, password: CUSTOMER.password })
        .expect(200);

      const cookie = refreshCookieOf(login);
      const accessToken = login.body.data.accessToken as string;

      const response = await request(server())
        .post('/api/auth/logout-all')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.revokedSessions).toBeGreaterThan(0);

      await request(server())
        .post('/api/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
    });
  });
});
