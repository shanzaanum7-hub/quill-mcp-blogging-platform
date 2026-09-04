# Spec 11 — Security

## Objective
Define every security control required across the Quill platform: input validation, authentication hardening, secret management, rate limiting, output sanitisation, dependency hygiene, and HTTP security headers. These controls apply to all packages and MUST be treated as non-negotiable requirements, not optional enhancements.

---

## Requirements

1. All user-supplied input MUST be validated with Zod before reaching the service layer.
2. Passwords MUST be hashed with `argon2id`. No other algorithm is acceptable.
3. Sessions MUST use signed, HTTP-only cookies. `Secure` flag MUST be set in production.
4. API keys MUST be stored as SHA-256 hashes. The raw key MUST be shown only once.
5. All SQL MUST use parameterised queries (`better-sqlite3` prepared statements). String interpolation into SQL is forbidden.
6. All Markdown rendered in the browser MUST be sanitised with DOMPurify before `innerHTML` assignment.
7. HTTP security headers MUST be set on every response.
8. CORS MUST be restricted to origins defined in `CORS_ORIGINS`.
9. Rate limiting MUST be applied to all routes, with stricter limits on auth endpoints.
10. Environment secrets MUST come from environment variables. Hardcoded secrets are forbidden.
11. Stack traces MUST NOT be included in production error responses.
12. `user_id` MUST NOT be accepted as input in any MCP tool.

---

## Authentication Security

### Password Hashing

```typescript
// packages/services/src/AuthService.ts
import argon2 from 'argon2';

// Hash on register
const hash = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 65536,   // 64 MB
  timeCost: 3,
  parallelism: 4,
});

// Verify on login
const valid = await argon2.verify(hash, password);
```

**Timing attack mitigation on login:**
When the user's email is not found, still call `argon2.verify` against a pre-computed dummy hash to ensure constant-time response regardless of whether the email exists.

```typescript
const DUMMY_HASH = await argon2.hash('dummy-for-timing-attack-prevention');

async login(data: LoginData) {
  const user = await this.userRepo.findByEmail(data.email);
  const hashToVerify = user?.password_hash ?? DUMMY_HASH;
  const valid = await argon2.verify(hashToVerify, data.password);
  if (!user || !valid) throw new AppError('INVALID_CREDENTIALS', 'Invalid credentials', 401);
  return toUserPublic(user);
}
```

### Session Security

Fastify session configuration:
```typescript
await fastify.register(fastifySession, {
  secret:      env.SESSION_SECRET,    // min 64 chars from env
  cookieName:  'quill_session',
  cookie: {
    secure:   env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge:   7 * 24 * 60 * 60,        // 7 days in seconds
    path:     '/',
  },
  saveUninitialized: false,
});
```

Session data MUST include `createdAt` timestamp. Sessions older than 7 days MUST be rejected even if the cookie is still valid.

### API Key Security

- Raw key: `quill_` + `crypto.randomBytes(32).toString('base64url')` — 256 bits of entropy
- Stored: `SHA-256(rawKey)` — one-way, non-reversible
- Never logged at any log level
- Prefix (`rawKey.slice(0, 14)`) stored only for display — not usable for auth

Key verification MUST NOT use string comparison. Use `crypto.timingSafeEqual` on the hash buffers:
```typescript
function verifyHash(input: string, stored: string): boolean {
  const inputBuf  = Buffer.from(createHash('sha256').update(input).digest('hex'));
  const storedBuf = Buffer.from(stored);
  if (inputBuf.length !== storedBuf.length) return false;
  return timingSafeEqual(inputBuf, storedBuf);
}
```

---

## Input Validation

### Layers of validation (defence in depth)

```
Request arrives
    │
    ▼
1. Fastify JSON Schema validation (route-level) → rejects malformed input, 400
    │
    ▼
2. Zod schema parse in service layer → rejects invalid business data, AppError(VALIDATION_ERROR)
    │
    ▼
3. SQLite prepared statement → parameterised, no injection possible
```

### Forbidden patterns
- No `req.body[field]` used directly in SQL strings
- No template literals containing user data passed to SQL
- No `eval()` or `Function()` constructor with user input
- No `dangerouslySetInnerHTML` without prior DOMPurify sanitisation
- No `innerHTML` assignment without prior DOMPurify sanitisation

### URL parameter validation
All `:id` and `:postId` params MUST be validated as positive integers before use:
```typescript
const id = parseInt(request.params.id, 10);
if (isNaN(id) || id <= 0) throw new AppError('VALIDATION_ERROR', 'Invalid ID', 400);
```

---

## HTTP Security Headers

Applied globally via a Fastify plugin:
```typescript
// packages/api/src/plugins/securityHeaders.plugin.ts
fastify.addHook('onSend', (request, reply, payload, done) => {
  reply.header('X-Content-Type-Options',  'nosniff');
  reply.header('X-Frame-Options',          'DENY');
  reply.header('X-XSS-Protection',         '1; mode=block');
  reply.header('Referrer-Policy',          'strict-origin-when-cross-origin');
  reply.header('Permissions-Policy',       'camera=(), microphone=(), geolocation=()');
  reply.header('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +    // Tailwind requires inline styles
    "img-src 'self' data: https:; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none';"
  );
  if (process.env.NODE_ENV === 'production') {
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  done(null, payload);
});
```

---

## CORS Configuration

```typescript
await fastify.register(fastifyCors, {
  origin: (origin, cb) => {
    const allowed = env.CORS_ORIGINS.split(',').map(o => o.trim());
    if (!origin || allowed.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'), false);
    }
  },
  credentials:     true,              // required for cookies
  methods:         ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders:  ['Content-Type', 'Authorization'],
  exposedHeaders:  ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
});
```

---

## Rate Limiting

| Route group | Per | Limit | Window |
|---|---|---|---|
| `POST /api/auth/login` | IP | 10 | 1 minute |
| `POST /api/auth/register` | IP | 5 | 1 minute |
| Public blog routes | IP | 60 | 1 minute |
| Authenticated API routes | userId (from session) | 120 | 1 minute |
| MCP routes | API key | 60 | 1 minute |
| `/health` | IP | 300 | 1 minute |

On limit exceeded: HTTP 429 with `Retry-After` header.

Banning: After 5 consecutive 401 errors from the same IP within 5 minutes, block the IP for 15 minutes. (Implemented as an in-memory counter in the rate limiter plugin — not persistent across restarts.)

---

## Output Security

### Error responses in production
```typescript
// In the global error handler (errorHandler.plugin.ts)
if (env.NODE_ENV === 'production' && !(error instanceof AppError)) {
  // Never leak internal error details or stack traces
  return reply.status(500).send({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }
  });
}
```

### Markdown / HTML output
- All Markdown rendered in the browser (`RenderedContent` component) passes through `DOMPurify.sanitize()`.
- DOMPurify configuration (see Spec 09) must strip all event handlers and `<script>` tags.
- The server NEVER renders Markdown to HTML — all rendering is client-side.
- Post content is stored as raw Markdown and returned as-is from the API.

### JSON responses
- No `password_hash` or `key_hash` fields MUST appear in any API response.
- `UserPublic` type explicitly excludes `password_hash`.
- `ApiKeyPublic` type explicitly excludes `key_hash`.
- TypeScript structural typing MUST make it impossible to accidentally include these fields.

---

## Secret Management

### Required secrets
| Secret | Source | Min length | Rotation |
|---|---|---|---|
| `SESSION_SECRET` | `process.env` | 64 chars | On compromise |
| Database file | `DATABASE_PATH` | — | N/A |

### Forbidden practices
- No secrets in source code
- No secrets in `docker-compose.yml` (use `.env` file or Docker secrets)
- No secrets in git history
- `.env` file is git-ignored (enforced in `.gitignore`)

### Generating secrets
Document in `.env.example`:
```bash
# Generate SESSION_SECRET:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
SESSION_SECRET=<64-char-hex-string>
```

---

## Dependency Security

1. All npm packages MUST be pinned to exact versions in `package.json` (no `^` or `~` ranges).
2. `pnpm audit` MUST pass with zero high or critical vulnerabilities before every release.
3. A `pnpm audit` check MUST be added to the CI pipeline.
4. Dev dependencies MUST be separated from production dependencies.
5. No package with known critical CVEs may be included.

---

## Multi-User Data Isolation

Every query that reads or writes user data MUST scope to the authenticated `userId`:

```typescript
// CORRECT — always include userId in the query
postRepo.findById(postId)  →  followed by ownership check in service
postRepo.findAllByUser(userId, filters)

// FORBIDDEN — never query without user scope when ownership matters
postRepo.findById(postId)  →  used directly without ownership check
```

The ownership check pattern is centralised in `PostService.getOwnedPost(userId, postId)` and MUST NOT be bypassed.

---

## Audit Logging

For the following events, a log entry MUST be written at `info` level including `userId`, action, resource ID, and timestamp:
- User registration
- User login (success and failure)
- API key creation
- API key revocation
- Post publish / unpublish / delete

Log format (JSON via Pino):
```json
{
  "level": "info",
  "time": "2026-09-01T10:00:00Z",
  "action": "post.published",
  "userId": 42,
  "postId": 7,
  "ip": "[not stored, only logged transiently]"
}
```

Logs MUST NOT include passwords, raw API keys, or session tokens.

---

## MCP-Specific Security

1. `user_id` MUST NOT be a parameter in any tool's Zod schema.
2. The MCP server MUST reject connections without a valid `Authorization: Bearer` header before establishing any SSE session.
3. A revoked API key MUST return 401 and MUST update `last_used_at` — so users can see when a revoked key was last attempted.
4. Tool handlers MUST NOT expose internal error details in `isError` results in production:
   ```typescript
   const message = env.NODE_ENV === 'production' && !(error instanceof AppError)
     ? 'An unexpected error occurred'
     : error.message;
   ```

---

## Acceptance Criteria

- [ ] `pnpm audit` produces zero high/critical vulnerabilities.
- [ ] No `password_hash` or `key_hash` field appears in any API response (automated test).
- [ ] Login with wrong password always returns the same error message as login with non-existent email.
- [ ] Logging in 11 times with wrong credentials returns 429 on the 11th attempt.
- [ ] A raw API key is not present in the database (only its hash).
- [ ] All responses include `X-Content-Type-Options: nosniff`.
- [ ] All responses include `X-Frame-Options: DENY`.
- [ ] CSP header is present on all responses.
- [ ] `HSTS` header is present in production (`NODE_ENV=production`).
- [ ] SQL injection attempt via post title returns 400 (validation) not a database error.
- [ ] XSS payload in Markdown post content is stripped by DOMPurify in the browser.
- [ ] Session cookie is `httpOnly` and `sameSite=lax`.
- [ ] MCP connection without `Authorization` header returns 401 before SSE handshake.
- [ ] Stack traces never appear in production error responses.

---

## Tests Required

| Test | Type | Description |
|---|---|---|
| Login — timing attack | Unit | Response time similar for unknown vs wrong-password |
| `verifyHash` — timing safe | Unit | `timingSafeEqual` used, not `===` |
| Password stored as argon2 | Unit | `hash.startsWith('$argon2id')` |
| No `password_hash` in response | Integration | API response object has no `password_hash` key |
| No `key_hash` in response | Integration | API key list has no `key_hash` key |
| Security headers | Integration | All required headers present on every response |
| CSP header | Integration | Correct `Content-Security-Policy` value |
| Rate limit — login | Integration | 429 after 10 attempts |
| SQL injection — post title | Integration | 400 returned, no DB error |
| XSS in post content | Unit (frontend) | `<script>` tag stripped by DOMPurify |
| Session cookie flags | Integration | `httpOnly=true`, `sameSite=lax` in `Set-Cookie` |
| MCP auth — no header | Integration | 401 before SSE |
| Production error — no stack trace | Unit | Stack trace absent in 500 response |
| `user_id` in MCP tool schema | Static/type | TypeScript compilation would fail if present |

---

## Dependencies

- Spec 01 — `AppError`, env utils
- Spec 02 — All repositories (parameterised query compliance)
- Spec 03 — Auth services and middleware
- Spec 04 — Route registration (header plugin registered before routes)
- Spec 06 — MCP auth middleware
- npm: `argon2`, built-in `node:crypto`

---

## Implementation Tasks

- [ ] T-11-1: Implement `securityHeaders.plugin.ts` and register before all routes
- [ ] T-11-2: Implement timing-safe login with dummy-hash strategy in `AuthService`
- [ ] T-11-3: Implement `timingSafeEqual` API key verification in `ApiKeyService`
- [ ] T-11-4: Audit all API response types — confirm no sensitive fields exposed
- [ ] T-11-5: Add `pnpm audit` step to CI pipeline
- [ ] T-11-6: Pin all production dependency versions in all `package.json` files
- [ ] T-11-7: Implement audit logging for key security events
- [ ] T-11-8: Write security-focused integration tests
- [ ] T-11-9: Verify DOMPurify XSS sanitisation in frontend unit tests
- [ ] T-11-10: Add production error response guard to global error handler

---

## Owner
**All devs** — security controls span every package. Dev C owns the HTTP security headers and rate limiting. Dev B owns the auth service security. Dev A owns the parameterised query compliance. Dev D owns the frontend DOMPurify configuration.
