# Phase 4 — Authentication & Authorization (RBAC)

**Goal:** a secure, revocable authentication system with deny-by-default authorization — the foundation every customer and admin feature depends on.

**Status: complete and verified** (28 unit + 36 e2e tests green, 17 of them auth flows).

---

## 1. Token model

| | Access token | Refresh token |
| --- | --- | --- |
| Format | JWT (HS256) | Opaque random 48 bytes (base64url) |
| Lifetime | `JWT_ACCESS_EXPIRES_IN` (15 m) | `JWT_REFRESH_EXPIRES_IN` (7 d) |
| Carried in | `Authorization: Bearer …` | HttpOnly cookie `refresh_token` |
| Stored server-side | No (stateless) | **Only its SHA-256 hash**, in `sessions` |
| Revocable | On expiry only | Immediately (per session or all) |
| Readable by JS | Yes (kept in memory by the app) | No |

Why opaque refresh tokens instead of a refresh JWT: a JWT can only be "revoked" by keeping a deny-list, which is exactly the same database lookup — so it adds signing overhead with no benefit. An opaque token also leaks nothing if intercepted.

**Access tokens are never put in `localStorage`.** The frontend will hold them in memory (Zustand store, no persist middleware) and re-obtain them from `/api/auth/refresh` on page load.

---

## 2. Flows

```
POST /api/auth/register ─┐
POST /api/auth/login ────┤→ verify bcrypt → create session (hashed token)
                         │→ set HttpOnly cookie + return accessToken
                         │
POST /api/auth/refresh ──┤→ hash cookie → find session
                         │   ├─ revoked?  → reuse detected → revoke ALL sessions → 401
                         │   ├─ expired?  → revoke → 401
                         │   └─ valid     → rotate: revoke old (atomic), create new
                         │                  → new cookie + new accessToken
POST /api/auth/logout ───┴→ revoke current session, clear cookie (204)
POST /api/auth/logout-all ─→ revoke every session of the user
```

Rotation is race-safe because the revocation is conditional:

```ts
// Mongo: only the first caller sees revokedAt === null
findOneAndUpdate({ _id, revokedAt: null }, { $set: { revokedAt: now, replacedByTokenHash } })
```

Exactly one concurrent refresh wins; the losers and any replayed token trigger reuse detection. In-memory test double reproduces the same guarantee, so the e2e test proves the behaviour, not just the mock.

---

## 3. Authorization model

Guards run in this order (registered in `app.module.ts`):

1. `ThrottlerGuard` — cheap rejection first.
2. `JwtAuthGuard` — **deny by default**: any route without `@Public()` requires a valid access token.
3. `RolesGuard` — enforces `@Roles(Role.Admin)` etc.

```ts
@Public()                      // opt out of authentication
@Roles(Role.Admin)             // require a role (server-side only)
@CurrentUser() user            // inject { id, email, role }
@CurrentUser('id') userId      // inject one property
```

Health and the scaffold root route are `@Public()`. Everything else — including every future admin endpoint — is closed unless explicitly opened.

Accepted tradeoff: the role travels inside the access token, so a role change takes effect within 15 minutes (next refresh) rather than instantly. Revoking *access* is immediate via `logout-all`, because the refresh session is what mints new tokens.

---

## 4. Password handling

- **bcrypt**, cost from `BCRYPT_ROUNDS` (default 12, tests use 4).
- Input capped at **72 bytes** — bcrypt silently ignores everything beyond that, so longer passwords would share a prefix.
- Registration requires ≥ 8 characters with a letter and a number; login enforces no strength rules (they would hint at what is worth guessing).
- Unknown email and wrong password return the **identical** 401 (`Invalid email or password`); an unknown email still performs a bcrypt compare against a dummy hash so response timing does not reveal account existence.
- `passwordHash` is `select: false` in the schema, lives on a repository type that never reaches a controller, and `UsersService.toPublicUser()` strips it — the e2e suite asserts the string never appears in any response.

---

## 5. Cookie policy

| Attribute | Value | Why |
| --- | --- | --- |
| `HttpOnly` | yes | XSS cannot read the refresh token |
| `Secure` | production only | HTTPS required; off for `localhost` dev |
| `SameSite` | `Lax` | cross-site POSTs don't send it → CSRF protection for `/auth/refresh` |
| `Path` | `/api/auth` | never sent to ordinary API or page requests |
| `expires` | session expiry | matches the stored session |

---

## 6. Files

```
src/modules/users/
├── users.module.ts
├── users.service.ts                    # hashing, credential verification, public mapping
├── repositories/users.repository.ts    # abstract class = DI token + plain record types
├── repositories/mongoose-users.repository.ts
└── schemas/user.schema.ts              # unique email, role, isActive, hash select:false

src/modules/auth/
├── auth.module.ts                      # global JwtModule (so guards anywhere can verify)
├── auth.controller.ts                  # register/login/refresh/logout/logout-all/me
├── auth.constants.ts                   # cookie name, path, options
├── dto/register.dto.ts · dto/login.dto.ts
├── guards/jwt-auth.guard.ts · guards/roles.guard.ts
├── interfaces/jwt-payload.interface.ts
├── services/auth.service.ts            # flows + rotation + reuse detection
├── services/token.service.ts           # signing, hashing, expiry
├── repositories/sessions.repository.ts · repositories/mongoose-sessions.repository.ts
└── schemas/session.schema.ts           # TTL index on expiresAt

src/common/utils/duration.util.ts       # "15m"/"7d" → ms (fail-fast on typos)
scripts/seed-admin.mjs                  # npm run seed:admin
test/support/create-test-app.ts         # app builder with DB removed from the graph
test/support/in-memory-{users,sessions}.repository.ts
test/support/admin-probe.controller.ts  # proves @Roles enforcement over HTTP
test/auth.e2e-spec.ts                   # 17 tests
```

Dependencies added: `@nestjs/jwt`, `bcrypt`, `@types/bcrypt`.

---

## 7. Environment (breaking change)

`JWT_ACCESS_SECRET` is now **required** (≥ 32 chars, placeholders rejected). An existing `.env` without it will refuse to boot — by design. Generate one per environment:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Then add to `backend/.env`:

```
JWT_ACCESS_SECRET=<generated value>
```

New optional variables: `BCRYPT_ROUNDS` (default 12), plus `SEED_ADMIN_*` for the seed script only.

---

## 8. Seeding the store owner

```powershell
cd C:\Users\megal\Desktop\Ecommerce26\backend
# add SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD to .env first
npm run seed:admin
```

Idempotent: creates the admin, or updates the password hash and role of an existing account with that email. Uses `--env-file=.env`, so the URI and credentials never appear on a command line. Remove `SEED_ADMIN_PASSWORD` afterwards.

---

## 9. Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | ✅ 0 errors |
| `npm run lint` | ✅ 0 warnings, 0 errors (61 files) |
| `npm run test` | ✅ **28 passed** |
| `npm run test:e2e` | ✅ **36 passed** (5 files) |
| `npm run build` + real ESM boot | ✅ bcrypt/@nestjs/jwt load; missing env aborts with a readable message and exit 1 |

Auth e2e coverage:

- register → 201, envelope, access token, `HttpOnly; Path=/api/auth; SameSite=Lax`, no `Secure` in test;
- response body contains **no** `passwordHash` and **no** refresh token;
- the stored password is a bcrypt hash, and the refresh token in the cookie is not a key in the session store (only the hash is stored);
- duplicate email → 409; weak password → 400 with details;
- wrong password and unknown email → identical 401 message;
- `me` without token → 401; malformed token → 401; valid token → 200;
- customer hitting an admin route → **403**, admin → 200 (real `@Roles` enforcement);
- refresh rotates the cookie, old token replay → 401 and the *new* token dies too (theft response);
- refresh without cookie → 401; forged token → 401;
- logout → 204, cookie cleared, session unusable; logout-all revokes and kills the cookie.

Also fixed in this phase: the Express 5 warning `paths as /users/* …` caused by registering middleware with `forRoutes('*')`. Request-id middleware now uses `app.use()`.

---

## 10. Pitfalls recorded for later phases

1. **A type-only import of a DI token breaks Nest.** `import type { UsersRepository }` leaves `design:paramtypes` undefined and the container cannot resolve it. Abstract-class tokens must be **value** imports. (Mongoose *types* must stay `import type` for the opposite reason — see `docs/ARCHITECTURE.md`.)
2. **`MongooseModule.forFeature` needs a real connection.** Any test that stubs the connection must also override the model tokens; `test/support/create-test-app.ts` centralises this so specs stay short.
3. **Query parameters need explicit `@Type(() => Number)`** because implicit conversion is off.

---

## 11. Remaining gaps (intentional)

- Email verification, forgot/reset password, and email-change flows need SMTP (Phase 12). Reset tokens will reuse the hashed-session pattern.
- No refresh-token cookie CSRF token beyond `SameSite=Lax`; if the frontend is ever served from a different site, add a double-submit token.
- Throttling is in-memory → per-instance. Redis storage in Phase 13.
- `@nestjs/jwt` verifies issuer/audience (`ecommerce-api` / `ecommerce-web`), but there is no key rotation yet.

---

## 12. Next task — Phase 5: users & customer profiles

1. `PATCH /api/users/me` (name, phone), `PATCH /api/users/me/password` (current + new password, re-hash, revoke other sessions).
2. Addresses sub-resource: schema (`label`, `line1`, `line2`, `city`, `state`, `postalCode`, `country`, `phone`, `isDefault`), CRUD scoped to the owner, one default enforced transactionally.
3. Admin: `GET /api/users` (paginated, searchable), `GET /api/users/:id`, `PATCH /api/users/:id/status` — all `@Roles(Role.Admin)`.
4. Response mappers so no customer document can leak internal fields; e2e for cross-user access (customer A must not read customer B's address → 404, not 403).
5. Frontend `(auth)` route group can start here, talking to the real endpoints.
