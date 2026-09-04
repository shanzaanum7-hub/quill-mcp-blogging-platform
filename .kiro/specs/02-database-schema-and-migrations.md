# Spec 02 — Database Schema and Migrations

## Objective
Define the complete SQLite database schema, migration system, and data-access repository layer. This package owns every SQL statement in the application. No other package may write raw SQL.

---

## Requirements

1. The database client MUST be a `better-sqlite3` singleton, initialised once and shared across all repositories.
2. A migration runner MUST execute on every application startup before any route or tool is registered.
3. Migrations MUST be sequential, numbered SQL files. Applied migrations MUST be tracked in a `schema_migrations` table.
4. Migrations MUST be idempotent — re-running already-applied migrations MUST be a no-op.
5. Each migration MUST have a corresponding `.down.sql` rollback file.
6. Repositories MUST be plain TypeScript classes that accept the DB client via constructor injection.
7. Repositories MUST contain ONLY SQL — no business logic, no validation, no ownership checks.
8. All repository methods MUST be synchronous (better-sqlite3 is synchronous by design).
9. All timestamps MUST be stored as ISO-8601 strings in UTC.
10. Foreign key enforcement MUST be enabled (`PRAGMA foreign_keys = ON`).
11. WAL mode MUST be enabled (`PRAGMA journal_mode = WAL`) for concurrent read performance.

---

## Data Models

### Table: `schema_migrations`
```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  filename   TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Table: `users`
```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  display_name  TEXT,
  bio           TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_email    ON users(email);
CREATE INDEX idx_users_username ON users(username);
```

### Table: `api_keys`
```sql
CREATE TABLE api_keys (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  key_hash     TEXT    NOT NULL UNIQUE,
  key_prefix   TEXT    NOT NULL,
  last_used_at TEXT,
  revoked      INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0, 1)),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_api_keys_user_id    ON api_keys(user_id);
CREATE INDEX idx_api_keys_key_prefix ON api_keys(key_prefix);
```

### Table: `posts`
```sql
CREATE TABLE posts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT    NOT NULL,
  slug            TEXT    NOT NULL,
  content         TEXT    NOT NULL DEFAULT '',
  excerpt         TEXT,
  status          TEXT    NOT NULL DEFAULT 'draft'
                          CHECK(status IN ('draft', 'published', 'scheduled')),
  published_at    TEXT,
  scheduled_for   TEXT,
  seo_title       TEXT,
  seo_description TEXT,
  seo_keywords    TEXT,
  canonical_url   TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, slug)
);
CREATE INDEX idx_posts_user_id    ON posts(user_id);
CREATE INDEX idx_posts_status     ON posts(status);
CREATE INDEX idx_posts_slug       ON posts(user_id, slug);
CREATE INDEX idx_posts_scheduled  ON posts(scheduled_for) WHERE status = 'scheduled';
```

### Table: `analytics_events`
```sql
CREATE TABLE analytics_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id     INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_type  TEXT    NOT NULL CHECK(event_type IN ('page_view', 'unique_view')),
  ip_hash     TEXT,
  user_agent  TEXT,
  referrer    TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_analytics_post_id    ON analytics_events(post_id);
CREATE INDEX idx_analytics_user_id    ON analytics_events(user_id);
CREATE INDEX idx_analytics_created_at ON analytics_events(created_at);
CREATE INDEX idx_analytics_type       ON analytics_events(event_type);
```

---

## Migration File Convention

Files live in `packages/database/src/migrations/`:

```
001_initial_schema.up.sql
001_initial_schema.down.sql
002_analytics_indexes.up.sql
002_analytics_indexes.down.sql
```

Rules:
- Filename format: `{NNN}_{description}.{up|down}.sql`
- `NNN` is zero-padded to 3 digits.
- The runner reads all `*.up.sql` files, sorts them lexicographically, and skips any whose `filename` already exists in `schema_migrations`.
- On rollback (manual CLI only), the runner executes the matching `.down.sql` and removes the row from `schema_migrations`.

---

## Database Client (`packages/database/src/client.ts`)

```typescript
// Exports a factory function, not a module-level singleton,
// so tests can create isolated in-memory databases.

export function createDatabaseClient(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  return db;
}
```

The consuming application (api, mcp) creates the singleton by calling `createDatabaseClient(env.DATABASE_PATH)` once at startup and passes it to all repository constructors.

---

## Repository Interfaces and Implementations

### `UserRepository`

```typescript
interface IUserRepository {
  findById(id: number): UserRow | undefined;
  findByEmail(email: string): UserRow | undefined;
  findByUsername(username: string): UserRow | undefined;
  create(data: CreateUserData): UserRow;
  update(id: number, data: Partial<UpdateUserData>): UserRow | undefined;
  delete(id: number): boolean;
}
```

Data types:
```typescript
type UserRow = {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
};

type CreateUserData = {
  username: string;
  email: string;
  password_hash: string;
  display_name?: string;
  bio?: string;
};

type UpdateUserData = {
  display_name?: string;
  bio?: string;
  password_hash?: string;
  updated_at: string;
};
```

### `PostRepository`

```typescript
interface IPostRepository {
  findById(id: number): PostRow | undefined;
  findBySlug(userId: number, slug: string): PostRow | undefined;
  findAllByUser(userId: number, filters: PostFilters): PostRow[];
  countByUser(userId: number, filters: PostFilters): number;
  findPublishedByUsername(username: string, page: number, limit: number): PostRow[];
  findPublishedBySlug(username: string, slug: string): PostRow | undefined;
  findScheduledDue(): PostRow[];
  create(data: CreatePostData): PostRow;
  update(id: number, data: Partial<UpdatePostData>): PostRow | undefined;
  delete(id: number): boolean;
  slugExistsForUser(userId: number, slug: string, excludeId?: number): boolean;
}

type PostFilters = {
  status?: 'draft' | 'published' | 'scheduled';
  page?: number;
  limit?: number;
};
```

### `ApiKeyRepository`

```typescript
interface IApiKeyRepository {
  findById(id: number): ApiKeyRow | undefined;
  findByHash(keyHash: string): ApiKeyRow | undefined;
  findAllByUser(userId: number): ApiKeyRow[];
  create(data: CreateApiKeyData): ApiKeyRow;
  updateLastUsed(id: number, lastUsedAt: string): void;
  revoke(id: number): boolean;
}
```

### `AnalyticsRepository`

```typescript
interface IAnalyticsRepository {
  insert(data: CreateAnalyticsEventData): void;
  countByPost(postId: number, from: string, to: string): AnalyticsSummary;
  countByUser(userId: number, from: string, to: string): AnalyticsSummary;
  topPostsByUser(userId: number, from: string, to: string, limit: number): TopPostRow[];
}

type AnalyticsSummary = {
  total_views: number;
  unique_views: number;
};

type TopPostRow = {
  post_id: number;
  title: string;
  slug: string;
  total_views: number;
  unique_views: number;
};
```

---

## Inputs / Outputs

| Operation | Input | Output |
|---|---|---|
| `createDatabaseClient` | `path: string` | `Database.Database` instance |
| `MigrationRunner.run` | `db: Database.Database` | `void` — throws on SQL error |
| `UserRepository.create` | `CreateUserData` | `UserRow` |
| `PostRepository.findAllByUser` | `userId`, `PostFilters` | `PostRow[]` |
| `ApiKeyRepository.findByHash` | `keyHash: string` | `ApiKeyRow \| undefined` |
| `AnalyticsRepository.countByPost` | `postId`, `from`, `to` | `AnalyticsSummary` |

---

## Validation Rules (repository level — structural only)

- Repositories do NOT validate business rules.
- Repositories MUST throw a native `better-sqlite3` error on SQL constraint violations; the service layer MUST catch and translate these to `AppError` instances.
- `page` defaults to `1`, `limit` defaults to `20`, max `limit` is `100` (enforced in service layer, not repository).

---

## Authentication Requirements

- None. The database package has no knowledge of authentication. It stores `password_hash` and `key_hash` as opaque strings.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Unique constraint violation on `users.email` | SQLite throws `UNIQUE constraint failed`; service catches and maps to `AppError('EMAIL_TAKEN', 409)` |
| Unique constraint violation on `posts(user_id, slug)` | Service catches and generates a new slug |
| Foreign key violation | SQLite throws; service maps to `AppError('REFERENCE_ERROR', 400)` |
| Migration SQL syntax error | Migration runner throws with filename + error message; application does NOT start |
| Database file not found / unreadable | `createDatabaseClient` throws; application does NOT start |

---

## Acceptance Criteria

- [ ] `pnpm migrate` runs all migrations against a fresh database with zero errors.
- [ ] Re-running `pnpm migrate` on an already-migrated database is a no-op.
- [ ] All four tables and all indexes exist after migration 001.
- [ ] `PRAGMA foreign_keys` returns `1` after client initialisation.
- [ ] `PRAGMA journal_mode` returns `wal` after client initialisation.
- [ ] `UserRepository.create` returns the created row with a populated `id`.
- [ ] `PostRepository.findAllByUser` returns only rows belonging to the given `userId`.
- [ ] `ApiKeyRepository.findByHash` returns `undefined` for a revoked key (service-level concern — repo returns the row regardless; revocation filter is in the service).
- [ ] `AnalyticsRepository.countByPost` returns correct totals for a date range.
- [ ] TypeScript compiles with zero errors.

---

## Tests Required

| Test | Type | Description |
|---|---|---|
| Migration runner — fresh DB | Integration | All tables created, `schema_migrations` populated |
| Migration runner — idempotent | Integration | Second run adds no rows, no error |
| `UserRepository.create` | Integration | Row inserted, id returned |
| `UserRepository.findByEmail` | Integration | Returns correct row; undefined for miss |
| `PostRepository.create` + `findById` | Integration | Round-trip persists all fields |
| `PostRepository.findAllByUser` — pagination | Integration | Returns correct page slice |
| `PostRepository.findPublishedByUsername` | Integration | Returns only published posts |
| `ApiKeyRepository.create` + `findByHash` | Integration | Hash lookup works |
| `ApiKeyRepository.revoke` | Integration | `revoked = 1` after call |
| `AnalyticsRepository.insert` + `countByPost` | Integration | Counts match inserted rows |
| FK cascade on `users.delete` | Integration | All child rows deleted |
| WAL mode enabled | Integration | `PRAGMA journal_mode` returns `wal` |
| Foreign keys enabled | Integration | Inserting orphan post throws |

All integration tests MUST use an in-memory SQLite database (`:memory:`) seeded by the migration runner.

---

## Dependencies

- Spec 01 (Project Foundation) must be complete.
- `better-sqlite3` npm package must be installed in `packages/database`.
- `@types/better-sqlite3` must be installed as a dev dependency.

---

## Implementation Tasks

- [ ] T-02-1: Install `better-sqlite3` and types in `packages/database`
- [ ] T-02-2: Implement `packages/database/src/client.ts`
- [ ] T-02-3: Implement migration runner `packages/database/src/migrations/runner.ts`
- [ ] T-02-4: Write `001_initial_schema.up.sql` (all 4 tables + indexes)
- [ ] T-02-5: Write `001_initial_schema.down.sql` (DROP all tables)
- [ ] T-02-6: Implement `UserRepository` with full interface
- [ ] T-02-7: Implement `PostRepository` with full interface
- [ ] T-02-8: Implement `ApiKeyRepository` with full interface
- [ ] T-02-9: Implement `AnalyticsRepository` with full interface
- [ ] T-02-10: Export all repositories and client from `packages/database/src/index.ts`
- [ ] T-02-11: Write all integration tests using in-memory SQLite
- [ ] T-02-12: Add `migrate` script to `packages/database/package.json`

---

## Owner
**Dev A**
