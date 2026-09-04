# Spec 03 — Authentication

## Objective
Define and implement two completely separate, non-overlapping authentication mechanisms: session-based authentication for the web dashboard and API-key-based authentication for the MCP server. Both mechanisms MUST resolve to the same `userId` that is passed to the shared service layer.

---

## Requirements

1. Dashboard authentication MUST use signed HTTP-only cookies backed by a server-side session.
2. MCP authentication MUST use a bearer API key in the `Authorization` header.
3. The two auth mechanisms MUST NOT be interchangeable — an API key MUST NOT grant access to dashboard routes and vice versa.
4. API keys MUST be stored as SHA-256 hashes in the database. The raw key MUST only be returned once, at creation time, and never stored in plaintext.
5. Password hashing MUST use `argon2id` with recommended parameters.
6. Session secrets MUST come from environment variables and MUST be at least 64 characters.
7. Sessions MUST have a configurable TTL (default 7 days) and MUST be invalidated on logout.
8. MCP authentication middleware MUST look up the key, verify it is not revoked, update `last_used_at`, and attach `userId` to the request context.
9. Failed authentication MUST return a uniform error response and MUST NOT reveal whether the user exists.
10. Authentication MUST be enforced by reusable middleware/decorators, not inline in route handlers.

---

## API Key Design

### Key format
```
quill_<base64url(32 random bytes)>
```
Example: `quill_4Xk9mN2pQrL8vT0uWjY5sA1bCdEfGhIj`

Total length: ~50 characters.

### Key storage
- The service generates the raw key using `crypto.randomBytes(32)` encoded as `base64url`.
- The raw key is NEVER persisted.
- `key_hash = SHA-256(rawKey)` stored in `api_keys.key_hash`.
- `key_prefix = rawKey.slice(0, 8)` stored in `api_keys.key_prefix` for display.

### Key verification flow
```
1. Extract raw key from Authorization: Bearer <key>
2. Compute SHA-256(key)
3. Look up api_keys WHERE key_hash = SHA-256(key) AND revoked = 0
4. If not found → reject with 401
5. Update last_used_at = now()
6. Attach userId to request context
7. Proceed to tool handler
```

---

## Data Models

### Session data shape (stored server-side)
```typescript
type SessionData = {
  userId: number;
  email: string;
  username: string;
  createdAt: number; // epoch ms
};
```

### AuthContext (attached to every authenticated request)
```typescript
type AuthContext = {
  userId: number;
  authMethod: 'session' | 'api_key';
};
```

---

## `AuthService` (`packages/services/src/AuthService.ts`)

This service owns all authentication and user-management business logic.

```typescript
interface IAuthService {
  register(data: RegisterData): Promise<UserPublic>;
  login(data: LoginData): Promise<UserPublic>;
  getUserById(id: number): Promise<UserPublic>;
  changePassword(userId: number, data: ChangePasswordData): Promise<void>;
}

type RegisterData = {
  username: string;
  email: string;
  password: string;
};

type LoginData = {
  email: string;
  password: string;
};

type ChangePasswordData = {
  currentPassword: string;
  newPassword: string;
};

type UserPublic = {
  id: number;
  username: string;
  email: string;
  display_name: string | null;
  bio: string | null;
  created_at: string;
};
```

### Business rules
- `register`: validate input, check email uniqueness (throws `AppError('EMAIL_TAKEN', 409)`), check username uniqueness (throws `AppError('USERNAME_TAKEN', 409)`), hash password with argon2id, persist via `UserRepository.create`.
- `login`: find user by email, compare password with `argon2.verify`, return `UserPublic` on success, throw `AppError('INVALID_CREDENTIALS', 401)` on any failure. MUST take constant time on miss (argon2 verify against a dummy hash to prevent timing attacks).
- `getUserById`: throws `AppError('USER_NOT_FOUND', 404)` if not found.

---

## `ApiKeyService` (`packages/services/src/ApiKeyService.ts`)

```typescript
interface IApiKeyService {
  createKey(userId: number, name: string): Promise<CreateKeyResult>;
  listKeys(userId: number): Promise<ApiKeyPublic[]>;
  revokeKey(userId: number, keyId: number): Promise<void>;
  verifyKey(rawKey: string): Promise<{ userId: number }>;
}

type CreateKeyResult = {
  id: number;
  name: string;
  key_prefix: string;
  raw_key: string; // ONLY returned here, never stored
  created_at: string;
};

type ApiKeyPublic = {
  id: number;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  revoked: boolean;
  created_at: string;
};
```

### Business rules
- `createKey`: validate name (non-empty, max 64 chars), generate raw key, compute hash, persist.
- `listKeys`: returns all keys for user; `key_hash` is NEVER included in the response.
- `revokeKey`: verifies ownership (throws `AppError('KEY_NOT_FOUND', 404)` if key doesn't belong to user), sets `revoked = 1`.
- `verifyKey`: hashes raw key, looks up by hash, checks `revoked = 0`, updates `last_used_at`, returns `userId`. Throws `AppError('INVALID_API_KEY', 401)` on any failure.

---

## API Contracts

### `POST /api/auth/register`
**Auth:** None  
**Request body:**
```json
{
  "username": "string, 3–30 chars, alphanumeric + underscore",
  "email": "valid email",
  "password": "string, min 8 chars"
}
```
**Response 201:**
```json
{
  "success": true,
  "data": { "id": 1, "username": "alice", "email": "alice@example.com" }
}
```
**Errors:** `400 VALIDATION_ERROR`, `409 EMAIL_TAKEN`, `409 USERNAME_TAKEN`

---

### `POST /api/auth/login`
**Auth:** None  
**Request body:**
```json
{
  "email": "string",
  "password": "string"
}
```
**Response 200:** Sets `Set-Cookie: session=...` (HTTP-only, Secure in production)
```json
{
  "success": true,
  "data": { "id": 1, "username": "alice", "email": "alice@example.com" }
}
```
**Errors:** `401 INVALID_CREDENTIALS`

---

### `POST /api/auth/logout`
**Auth:** Session required  
**Response 200:** Clears session cookie
```json
{ "success": true }
```

---

### `GET /api/auth/me`
**Auth:** Session required  
**Response 200:**
```json
{
  "success": true,
  "data": { "id": 1, "username": "alice", "email": "alice@example.com", "display_name": null, "bio": null }
}
```
**Errors:** `401 UNAUTHORIZED`

---

### `GET /api/keys`
**Auth:** Session required  
**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Cursor",
      "key_prefix": "quill_4X",
      "last_used_at": "2026-08-01T12:00:00Z",
      "revoked": false,
      "created_at": "2026-07-01T10:00:00Z"
    }
  ]
}
```

---

### `POST /api/keys`
**Auth:** Session required  
**Request body:**
```json
{ "name": "string, 1–64 chars" }
```
**Response 201:** (raw key shown ONCE)
```json
{
  "success": true,
  "data": {
    "id": 2,
    "name": "Windsurf",
    "key_prefix": "quill_9Z",
    "raw_key": "quill_9Zk9mN2pQrL8vT0uWjY5sA1bCdEfGhIj",
    "created_at": "2026-09-01T10:00:00Z"
  }
}
```
**Errors:** `400 VALIDATION_ERROR`

---

### `DELETE /api/keys/:id`
**Auth:** Session required  
**Response 200:**
```json
{ "success": true }
```
**Errors:** `404 KEY_NOT_FOUND`, `403 FORBIDDEN`

---

## Middleware / Plugins

### `requireSession` (Fastify preHandler)
- Reads `request.session.data`.
- If session missing or expired → `401 UNAUTHORIZED`.
- Decorates `request` with `request.auth: AuthContext`.

### `requireApiKey` (Fastify preHandler — used by MCP routes only)
- Reads `Authorization: Bearer <key>` header.
- Calls `ApiKeyService.verifyKey(rawKey)`.
- On failure → `401 INVALID_API_KEY`.
- Decorates `request` with `request.auth: AuthContext`.

Both middlewares MUST be implemented as Fastify plugins registered before routes.

---

## Validation Rules

| Field | Rule |
|---|---|
| `username` | 3–30 chars, `^[a-zA-Z0-9_]+$`, must be unique |
| `email` | Valid RFC 5321 email, must be unique |
| `password` (register) | Min 8 chars, max 128 chars |
| `password` (login) | Non-empty |
| API key `name` | 1–64 chars, non-empty string |

All validation MUST use Zod schemas defined in `packages/shared/src/schemas/`.

---

## Error Handling

| Scenario | Code | HTTP Status |
|---|---|---|
| Email already registered | `EMAIL_TAKEN` | 409 |
| Username already taken | `USERNAME_TAKEN` | 409 |
| Wrong email or password | `INVALID_CREDENTIALS` | 401 |
| No session / expired | `UNAUTHORIZED` | 401 |
| Invalid or revoked API key | `INVALID_API_KEY` | 401 |
| Revoking another user's key | `FORBIDDEN` | 403 |
| Key not found | `KEY_NOT_FOUND` | 404 |
| Validation failure | `VALIDATION_ERROR` | 400 |

**Security note:** Login failures MUST return the same error message regardless of whether the email exists, to prevent user enumeration.

---

## Acceptance Criteria

- [ ] `POST /api/auth/register` creates a user and returns no password data.
- [ ] `POST /api/auth/login` sets an HTTP-only cookie on success.
- [ ] `POST /api/auth/logout` invalidates the session; subsequent `GET /api/auth/me` returns 401.
- [ ] Logging in with wrong password returns 401 with code `INVALID_CREDENTIALS`.
- [ ] Logging in with non-existent email returns 401 with the same message (no enumeration).
- [ ] `POST /api/keys` returns `raw_key` exactly once.
- [ ] `raw_key` is not present on any subsequent `GET /api/keys` response.
- [ ] `DELETE /api/keys/:id` prevents the key from being used in subsequent MCP calls.
- [ ] A revoked key returns 401 on MCP authentication.
- [ ] A valid API key sets `request.auth.userId` correctly on every request.
- [ ] Session-authenticated routes reject requests with API keys in the `Authorization` header.
- [ ] API key routes reject requests with only session cookies.

---

## Tests Required

| Test | Type | Description |
|---|---|---|
| `AuthService.register` — success | Unit | User created, password not stored in plain text |
| `AuthService.register` — duplicate email | Unit | Throws `EMAIL_TAKEN` |
| `AuthService.register` — duplicate username | Unit | Throws `USERNAME_TAKEN` |
| `AuthService.login` — correct credentials | Unit | Returns `UserPublic` |
| `AuthService.login` — wrong password | Unit | Throws `INVALID_CREDENTIALS` |
| `AuthService.login` — unknown email | Unit | Throws `INVALID_CREDENTIALS` (same error) |
| `ApiKeyService.createKey` | Unit | Returns `raw_key`, hash stored |
| `ApiKeyService.verifyKey` — valid | Unit | Returns `userId` |
| `ApiKeyService.verifyKey` — revoked | Unit | Throws `INVALID_API_KEY` |
| `ApiKeyService.revokeKey` — wrong owner | Unit | Throws `FORBIDDEN` |
| `POST /api/auth/register` | Integration | 201, cookie NOT set |
| `POST /api/auth/login` | Integration | 200, `Set-Cookie` header present |
| `GET /api/auth/me` — no session | Integration | 401 |
| `DELETE /api/keys/:id` | Integration | 200, key revoked in DB |
| `requireSession` middleware — no cookie | Integration | 401 |
| `requireApiKey` middleware — invalid key | Integration | 401 |

---

## Dependencies

- Spec 01 (Project Foundation) — `AppError`, `loadEnv`
- Spec 02 (Database) — `UserRepository`, `ApiKeyRepository`
- npm packages: `argon2`, `@fastify/session`, `@fastify/cookie`

---

## Implementation Tasks

- [ ] T-03-1: Define Zod schemas for `register`, `login`, `createKey` in `packages/shared/src/schemas/`
- [ ] T-03-2: Implement `AuthService` in `packages/services`
- [ ] T-03-3: Implement `ApiKeyService` in `packages/services`
- [ ] T-03-4: Implement `requireSession` Fastify plugin in `packages/api`
- [ ] T-03-5: Implement `requireApiKey` Fastify plugin in `packages/api`
- [ ] T-03-6: Implement auth routes (`/api/auth/*`) in `packages/api`
- [ ] T-03-7: Implement API key routes (`/api/keys`) in `packages/api`
- [ ] T-03-8: Write unit tests for `AuthService` and `ApiKeyService`
- [ ] T-03-9: Write integration tests for auth and key routes
- [ ] T-03-10: Verify session invalidation and API key revocation end-to-end

---

## Owner
**Dev B** (services) + **Dev C** (API routes and middleware)
