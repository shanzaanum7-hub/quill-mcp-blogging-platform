# Spec 12 — Testing

## Objective
Define the complete testing strategy for Quill: test types, toolchain configuration, coverage requirements, test data patterns, and per-package test inventories. Every acceptance criterion in every other spec is backed by tests defined here.

---

## Requirements

1. Vitest MUST be the single test runner for all server-side packages (unit + integration).
2. Playwright MUST be used for E2E tests.
3. All tests MUST be runnable with `pnpm test` (one command, from the workspace root).
4. Unit tests MUST mock at the repository boundary — services are tested with fake repositories.
5. Integration tests MUST use real in-memory SQLite databases (`:memory:`) seeded by the migration runner.
6. No test MUST share mutable state with another test. Each test manages its own setup/teardown.
7. The API server integration tests MUST use Fastify's `inject()` — no real HTTP ports opened.
8. Coverage MUST be collected for `packages/shared`, `packages/database`, `packages/services`, and `packages/api`.
9. Coverage thresholds: **80% line coverage minimum** across all instrumented packages.
10. E2E tests MUST run against a fully started application (real ports, real SQLite file).
11. CI MUST fail if coverage falls below threshold or any test fails.

---

## Test Type Definitions

| Type | Location | Runner | DB | Network |
|---|---|---|---|---|
| **Unit** | `packages/*/src/**/*.test.ts` | Vitest | Mock / none | None |
| **Integration** | `tests/integration/**/*.test.ts` | Vitest | In-memory SQLite | Fastify `inject()` |
| **E2E** | `tests/e2e/**/*.spec.ts` | Playwright | Real SQLite file | Real HTTP ports |

---

## Toolchain Configuration

### `vitest.config.ts` (root)

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals:     true,
    environment: 'node',
    include:     ['packages/*/src/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    coverage: {
      provider:  'v8',
      reporter:  ['text', 'lcov', 'html'],
      include:   ['packages/shared/src/**', 'packages/database/src/**',
                  'packages/services/src/**', 'packages/api/src/**'],
      exclude:   ['**/index.ts', '**/*.d.ts'],
      thresholds: { lines: 80, functions: 80, branches: 75 },
    },
    // Isolate each test file in its own worker
    pool:           'forks',
    poolOptions: { forks: { singleFork: false } },
  },
});
```

### Playwright config (`playwright.config.ts`, root)

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:   './tests/e2e',
  use: {
    baseURL:      'http://localhost:5173',  // Vite dev server
    headless:     true,
    screenshot:   'only-on-failure',
  },
  webServer: [
    { command: 'pnpm dev:api',  url: 'http://localhost:3001/health', reuseExistingServer: true },
    { command: 'pnpm dev:mcp',  url: 'http://localhost:3002/health', reuseExistingServer: true },
    { command: 'pnpm dev:web',  url: 'http://localhost:5173',         reuseExistingServer: true },
  ],
});
```

---

## Test Utilities and Helpers

### `tests/helpers/db.ts` — In-memory DB factory
```typescript
export function createTestDb(): Database.Database {
  const db = createDatabaseClient(':memory:');
  runMigrations(db);
  return db;
}
```

### `tests/helpers/seeds.ts` — Seeding helpers
```typescript
export async function seedUser(db, overrides = {}) { ... }
export async function seedPost(db, userId, overrides = {}) { ... }
export async function seedApiKey(db, userId, overrides = {}) { ... }
```

### `tests/helpers/app.ts` — Test API server factory
```typescript
export async function createTestApp() {
  const db       = createTestDb();
  const services = createServiceContainer(db);
  const app      = await createApp(services);
  await app.ready();
  return { app, db, services };
}
```

### `tests/helpers/mocks.ts` — Repository mocks
```typescript
// Used for unit tests — implements the repository interface with jest.fn() / vi.fn()
export function mockPostRepo(overrides = {}): IPostRepository { ... }
export function mockUserRepo(overrides = {}): IUserRepository { ... }
export function mockApiKeyRepo(overrides = {}): IApiKeyRepository { ... }
export function mockAnalyticsRepo(overrides = {}): IAnalyticsRepository { ... }
```

---

## Unit Test Inventory

### `packages/shared`

| File | Tests |
|---|---|
| `utils/slug.test.ts` | `generateSlug`: normal, special chars, max length; `ensureUniqueSlug`: no collision, collision +2, collision +3 |
| `utils/date.test.ts` | `parseISOString`: valid, invalid → AppError; `isFuture`: past/future/exact-now |
| `utils/env.test.ts` | Missing required keys → throws listing all missing; all present → returns typed config |
| `errors/AppError.test.ts` | Constructor sets code, statusCode, message; instanceof check |

### `packages/services` — `PostService`

| Test | Mocked dependency |
|---|---|
| `createPost` — generates slug | `postRepo.slugExistsForUser` returns false |
| `createPost` — slug collision | `postRepo.slugExistsForUser` returns true once |
| `createPost` — validation error (empty title) | — |
| `updatePost` — success | `postRepo.findById` returns owned post |
| `updatePost` — not found | `postRepo.findById` returns undefined |
| `updatePost` — wrong owner | `postRepo.findById` returns different user_id |
| `publishPost` — success | Post is draft |
| `publishPost` — already published | Post is published |
| `schedulePost` — future datetime | — |
| `schedulePost` — past datetime | — |
| `schedulePost` — invalid ISO string | — |
| `unpublishPost` — from published | — |
| `unpublishPost` — already draft | — |
| `manageSeo` — partial update | Existing SEO fields preserved |
| `manageSeo` — invalid canonical_url (http) | Throws VALIDATION_ERROR |
| `getPublicPosts` — user not found | `userRepo.findByUsername` returns undefined |
| `getPublicPost` — not published | Status is draft → 404 |

### `packages/services` — `AuthService`

| Test | Description |
|---|---|
| `register` — success | User created, returned without password_hash |
| `register` — duplicate email | Throws EMAIL_TAKEN |
| `register` — duplicate username | Throws USERNAME_TAKEN |
| `login` — correct password | Returns UserPublic |
| `login` — wrong password | Throws INVALID_CREDENTIALS |
| `login` — unknown email | Throws INVALID_CREDENTIALS (same message) |
| `login` — timing safety | argon2.verify called even for unknown email |

### `packages/services` — `ApiKeyService`

| Test | Description |
|---|---|
| `createKey` — success | raw_key returned, hash in repo |
| `createKey` — empty name | Throws VALIDATION_ERROR |
| `verifyKey` — valid key | Returns userId, updates last_used_at |
| `verifyKey` — revoked | Throws INVALID_API_KEY |
| `verifyKey` — wrong hash | Throws INVALID_API_KEY |
| `revokeKey` — success | Repo revoke called |
| `revokeKey` — wrong owner | Throws FORBIDDEN |
| `listKeys` — no key_hash in output | key_hash field absent from results |

### `packages/services` — `AnalyticsService`

| Test | Description |
|---|---|
| `recordEvent` | Calls repo insert with correct data |
| `getPostAnalytics` — owns post | Returns result |
| `getPostAnalytics` — wrong owner | Throws FORBIDDEN |
| `getAccountAnalytics` — range 7d | Correct date bounds computed |
| `getAccountAnalytics` — range all | from = epoch 0 |
| `rangeToDateBounds` — all 4 ranges | Correct from/to values |

### `packages/mcp/src/tools`

| Test (per tool) | Description |
|---|---|
| Happy path | Service method called with correct userId from context |
| Validation failure | `isError: true`, VALIDATION_ERROR message |
| Service throws AppError | `isError: true`, correct code in message |
| Service throws unexpected | `isError: true`, no crash |
| `user_id` absent from input schema | `schema.shape.user_id` is undefined |

---

## Integration Test Inventory

All integration tests use `createTestApp()` and `app.inject()`.

### Auth routes

| Test | Expected |
|---|---|
| `POST /api/auth/register` — valid | 201, no password_hash in body |
| `POST /api/auth/register` — duplicate email | 409 EMAIL_TAKEN |
| `POST /api/auth/login` — valid | 200, Set-Cookie header |
| `POST /api/auth/login` — wrong password | 401 INVALID_CREDENTIALS |
| `POST /api/auth/logout` — with session | 200, cookie cleared |
| `GET /api/auth/me` — no session | 401 UNAUTHORIZED |
| `GET /api/auth/me` — with session | 200, user data |

### Post routes

| Test | Expected |
|---|---|
| `POST /api/posts` — valid | 201, PostFull returned |
| `POST /api/posts` — missing title | 400 VALIDATION_ERROR |
| `GET /api/posts` — paginated | 200, correct page/total |
| `GET /api/posts?status=draft` | Only draft posts returned |
| `GET /api/posts/:id` — own post | 200, PostFull |
| `GET /api/posts/:id` — other user | 403 FORBIDDEN |
| `PUT /api/posts/:id` — valid | 200, updated fields |
| `DELETE /api/posts/:id` — own | 200 |
| `DELETE /api/posts/:id` — other user | 403 |
| `POST /api/posts/:id/publish` | 200, status=published |
| `POST /api/posts/:id/publish` — again | 409 ALREADY_PUBLISHED |
| `POST /api/posts/:id/schedule` — future | 200, status=scheduled |
| `POST /api/posts/:id/schedule` — past | 400 INVALID_SCHEDULE_TIME |
| `PUT /api/posts/:id/seo` | 200, SEO fields updated |

### API key routes

| Test | Expected |
|---|---|
| `GET /api/keys` | 200, no key_hash in any item |
| `POST /api/keys` — valid | 201, raw_key present |
| `DELETE /api/keys/:id` — own | 200 |
| `DELETE /api/keys/:id` — other user | 403 |

### Analytics routes

| Test | Expected |
|---|---|
| `GET /api/analytics?range=30d` | 200, totals and top_posts |
| `GET /api/analytics/:postId` — own | 200 |
| `GET /api/analytics/:postId` — other | 403 |
| `POST /api/public/.../view` — new visitor | 200, unique_view inserted |
| `POST /api/public/.../view` — return visitor | 200, only page_view inserted |
| `POST /api/public/.../view` — non-existent post | 200 (no error) |

### Public routes

| Test | Expected |
|---|---|
| `GET /api/public/:username/posts` | 200, only published posts |
| `GET /api/public/:username/posts/:slug` | 200, PostPublic shape |
| `GET /api/public/:username/posts/:slug` — draft | 404 |
| `GET /api/public/nonexistent/posts` | 404 USER_NOT_FOUND |
| `GET /api/public/feed` | 200, posts from multiple users |

### Security

| Test | Expected |
|---|---|
| Response headers — all routes | X-Content-Type-Options, X-Frame-Options present |
| CSP header | Correct value present |
| Rate limit — POST /api/auth/login | 429 after 10 attempts |
| No password_hash in register response | Key absent from response body |
| No key_hash in key list response | Key absent from all items |

### Database

| Test | Expected |
|---|---|
| Migration runner — fresh DB | All tables created |
| Migration runner — idempotent | No error on second run |
| FK cascade — delete user | All posts, keys, events deleted |

---

## E2E Test Inventory

Playwright tests run against the full stack.

| Test | Steps |
|---|---|
| **Happy path: register, write, publish** | Register → create post → publish → visit public blog URL → post visible |
| **Login / logout** | Login → see dashboard → logout → dashboard redirects to login |
| **API key creation** | Login → navigate to Keys → create key → copy raw key → key appears in list |
| **API key revocation** | Login → create key → revoke key → key shows as revoked |
| **Delete post with confirmation** | Create post → click delete → confirm dialog → post removed from list |
| **MCP tool via HTTP** | Create API key → call `create_post` tool via HTTP/SSE → post appears in dashboard |
| **SEO fields on public blog** | Set seo_title + seo_description → publish → check `<title>` and `<meta>` on public blog |
| **Schedule post** | Create post → schedule for future → status shows "scheduled" |
| **Analytics view** | Publish post → visit public blog → check analytics page shows view count > 0 |

---

## Test Data Conventions

1. Each test creates its own data using seed helpers.
2. User emails in tests use `test-<uuid>@example.com` to avoid collisions.
3. No test relies on a fixed database ID (e.g., `id: 1`).
4. Dates in tests use `Date.now() + ms` to ensure "future" dates remain future.
5. Passwords in tests use `'TestPassword1!'` consistently.
6. API keys in tests are created through the service (not inserted directly) to ensure correct hashing.

---

## Coverage Requirements

| Package | Line % | Branch % | Function % |
|---|---|---|---|
| `@quill/shared` | 90 | 85 | 90 |
| `@quill/database` | 85 | 80 | 85 |
| `@quill/services` | 90 | 85 | 90 |
| `@quill/api` | 80 | 75 | 80 |

Coverage is NOT required for `@quill/web`, `@quill/blog`, or `@quill/mcp` tools (covered by E2E and unit tests respectively) but should be collected.

---

## CI Pipeline Steps

```
1. pnpm install --frozen-lockfile
2. pnpm typecheck
3. pnpm lint
4. pnpm test --coverage        ← unit + integration, fails if below threshold
5. pnpm audit --audit-level=high
6. pnpm build
7. pnpm test:e2e               ← Playwright, runs against built app
```

---

## Acceptance Criteria

- [ ] `pnpm test` runs all unit and integration tests with zero failures.
- [ ] Coverage report shows all packages at or above their thresholds.
- [ ] `pnpm test:e2e` completes the happy-path E2E test end-to-end.
- [ ] Every acceptance criterion listed in Specs 01–11 maps to at least one test.
- [ ] No test imports from `@quill/database` directly in service unit tests.
- [ ] No test leaks state to another test (verified by running tests in random order).
- [ ] Playwright screenshots on failure are saved to `tests/e2e/screenshots/`.

---

## Dependencies

- Spec 01–11 — all specs (tests validate every acceptance criterion)
- npm (dev): `vitest`, `@vitest/coverage-v8`, `@playwright/test`, `supertest` (optional, Fastify inject preferred)

---

## Implementation Tasks

- [ ] T-12-1: Configure root `vitest.config.ts` with coverage thresholds
- [ ] T-12-2: Implement `tests/helpers/db.ts`, `seeds.ts`, `app.ts`, `mocks.ts`
- [ ] T-12-3: Write all `@quill/shared` unit tests
- [ ] T-12-4: Write all `@quill/database` integration tests
- [ ] T-12-5: Write all `@quill/services` unit tests
- [ ] T-12-6: Write all `@quill/api` integration tests
- [ ] T-12-7: Write all MCP tool unit tests
- [ ] T-12-8: Configure Playwright and write E2E tests
- [ ] T-12-9: Verify coverage thresholds pass
- [ ] T-12-10: Add `pnpm audit` to CI steps

---

## Owner
**All devs** — each developer writes tests for their owned package. Dev A: shared + database. Dev B: services. Dev C: API + MCP tools. Dev D: web + blog (frontend unit + E2E).
