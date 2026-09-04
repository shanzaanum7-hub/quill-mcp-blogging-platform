# Spec 05 — Shared Business Services

## Objective
Implement every piece of business logic in `packages/services` as plain TypeScript classes. Both the REST API layer (Spec 04) and the MCP layer (Spec 06/07) MUST call these services and MUST NOT duplicate any logic. This package is the single authoritative source of business rules.

---

## Requirements

1. Each service MUST be a class with a public interface (TypeScript `interface`).
2. Services MUST receive repository instances via constructor injection — no singletons inside services.
3. Services MUST be the ONLY place where:
   - Ownership checks are performed (does this user own this resource?)
   - Business state transitions are validated (can a draft post be published?)
   - Domain constraints are enforced (slug uniqueness, schedule must be future)
4. Services MUST NOT perform HTTP parsing, response formatting, or transport-level concerns.
5. Services MUST throw `AppError` with typed codes on every business rule violation.
6. Services MUST be independently unit-testable with mocked repositories.
7. The `packages/services/src/index.ts` MUST export all service interfaces and classes.

---

## Service Inventory

| Service | Responsibility |
|---|---|
| `PostService` | Full post lifecycle |
| `AuthService` | User registration, login, profile |
| `ApiKeyService` | Key creation, verification, revocation |
| `AnalyticsService` | Recording and querying analytics events |

> `AuthService` and `ApiKeyService` are fully specified in Spec 03. This spec adds full detail for `PostService` and `AnalyticsService`, and adds the `ServiceContainer` assembly pattern.

---

## `PostService`

### Interface

```typescript
interface IPostService {
  createPost(userId: number, data: CreatePostInput): PostFull;
  updatePost(userId: number, postId: number, data: UpdatePostInput): PostFull;
  deletePost(userId: number, postId: number): void;
  listPosts(userId: number, filters: ListPostsInput): PaginatedPosts;
  getPost(userId: number, postId: number): PostFull;
  publishPost(userId: number, postId: number): PostFull;
  schedulePost(userId: number, postId: number, scheduledFor: string): PostFull;
  unpublishPost(userId: number, postId: number): PostFull;
  manageSeo(userId: number, postId: number, data: SeoInput): PostFull;
  getPublicPosts(username: string, page: number, limit: number): PublicPostsResult;
  getPublicPost(username: string, slug: string): PostPublic;
}
```

### Input / Output Types

```typescript
type CreatePostInput = {
  title: string;         // 1–200 chars
  content: string;       // non-empty
  excerpt?: string;      // max 500 chars
};

type UpdatePostInput = {
  title?: string;
  content?: string;
  excerpt?: string;
};

type ListPostsInput = {
  status?: 'draft' | 'published' | 'scheduled';
  page?: number;    // default 1
  limit?: number;   // default 20, max 100
};

type SeoInput = {
  seo_title?: string;        // max 60 chars
  seo_description?: string;  // max 160 chars
  seo_keywords?: string;     // max 200 chars
  canonical_url?: string;    // valid https:// URL
};

type PaginatedPosts = {
  posts: PostSummary[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

type PublicPostsResult = {
  author: { username: string; display_name: string | null; bio: string | null };
  posts: PostPublic[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};
```

### Business Rules — `createPost`
1. Validate input via Zod schema from `@quill/shared`. Throw `AppError('VALIDATION_ERROR', 400)` on failure.
2. Generate slug from title using `generateSlug(title)`.
3. If `slugExistsForUser(userId, slug)` is true, call `ensureUniqueSlug(slug, existingSlugs)` to produce a non-colliding variant.
4. Set `status = 'draft'`, `published_at = null`, `scheduled_for = null`.
5. Persist via `PostRepository.create`.
6. Return `PostFull`.

### Business Rules — `updatePost`
1. Call `getOwnedPost(userId, postId)` — throws `AppError('POST_NOT_FOUND', 404)` or `AppError('FORBIDDEN', 403)`.
2. If `title` changed, regenerate slug (same uniqueness logic as create, excluding current post id).
3. Set `updated_at = now()`.
4. Persist via `PostRepository.update`.
5. Return updated `PostFull`.

### Business Rules — `deletePost`
1. Call `getOwnedPost(userId, postId)`.
2. Call `PostRepository.delete(postId)`.
3. Return void.

### Business Rules — `publishPost`
1. Call `getOwnedPost(userId, postId)`.
2. If `status === 'published'`, throw `AppError('ALREADY_PUBLISHED', 409)`.
3. Set `status = 'published'`, `published_at = now()`, `scheduled_for = null`.
4. Persist and return `PostFull`.

### Business Rules — `schedulePost`
1. Call `getOwnedPost(userId, postId)`.
2. Parse `scheduledFor` as ISO 8601. Throw `AppError('INVALID_DATE', 400)` if not parseable.
3. If `scheduledFor` is not in the future, throw `AppError('INVALID_SCHEDULE_TIME', 400)`.
4. Set `status = 'scheduled'`, `scheduled_for = scheduledFor`, `published_at = null`.
5. Persist and return `PostFull`.

### Business Rules — `unpublishPost`
1. Call `getOwnedPost(userId, postId)`.
2. If `status === 'draft'`, throw `AppError('ALREADY_DRAFT', 409)`.
3. Set `status = 'draft'`, `published_at = null`, `scheduled_for = null`.
4. Persist and return `PostFull`.

### Business Rules — `manageSeo`
1. Call `getOwnedPost(userId, postId)`.
2. Validate `canonical_url` if present (must be `https://`).
3. Merge provided fields onto existing SEO fields (partial update — unset fields are not cleared).
4. Persist and return `PostFull`.

### Business Rules — `getPublicPosts` / `getPublicPost`
1. Look up user by `username`; throw `AppError('USER_NOT_FOUND', 404)` if not found.
2. Return only posts with `status = 'published'`.
3. `getPublicPost` throws `AppError('POST_NOT_FOUND', 404)` if post doesn't exist or isn't published.

### Private helper
```typescript
private getOwnedPost(userId: number, postId: number): PostRow {
  const post = this.postRepo.findById(postId);
  if (!post) throw new AppError('POST_NOT_FOUND', 'Post not found', 404);
  if (post.user_id !== userId) throw new AppError('FORBIDDEN', 'Access denied', 403);
  return post;
}
```

---

## `AnalyticsService`

### Interface

```typescript
interface IAnalyticsService {
  recordEvent(data: RecordEventInput): void;
  getPostAnalytics(userId: number, postId: number, range: AnalyticsRange): PostAnalyticsResult;
  getAccountAnalytics(userId: number, range: AnalyticsRange): AccountAnalyticsResult;
}

type AnalyticsRange = '7d' | '30d' | '90d' | 'all';

type RecordEventInput = {
  postId: number;
  userId: number | null;
  eventType: 'page_view' | 'unique_view';
  ipHash?: string;
  userAgent?: string;
  referrer?: string;
};

type PostAnalyticsResult = {
  post_id: number;
  title: string;
  slug: string;
  total_views: number;
  unique_views: number;
  range: AnalyticsRange;
};

type AccountAnalyticsResult = {
  total_views: number;
  unique_views: number;
  top_posts: TopPost[];
  range: AnalyticsRange;
};

type TopPost = {
  post_id: number;
  title: string;
  slug: string;
  total_views: number;
  unique_views: number;
};
```

### Business Rules
- `recordEvent`: Persist via `AnalyticsRepository.insert`. No validation beyond type safety; this is a fire-and-forget write path.
- `getPostAnalytics`: Call `getOwnedPost(userId, postId)` first (ownership check). Compute `from`/`to` dates from `range`. Call `AnalyticsRepository.countByPost`.
- `getAccountAnalytics`: Call `AnalyticsRepository.countByUser` + `AnalyticsRepository.topPostsByUser`.

### Range-to-date conversion
```typescript
function rangeToDateBounds(range: AnalyticsRange): { from: string; to: string } {
  const to = new Date();
  const from = range === 'all' ? new Date(0) : subDays(to, { '7d': 7, '30d': 30, '90d': 90 }[range]);
  return { from: toISOString(from), to: toISOString(to) };
}
```

---

## ServiceContainer Assembly

`packages/services/src/index.ts` exports a factory:

```typescript
export function createServiceContainer(db: Database.Database): ServiceContainer {
  const userRepo     = new UserRepository(db);
  const postRepo     = new PostRepository(db);
  const apiKeyRepo   = new ApiKeyRepository(db);
  const analyticsRepo = new AnalyticsRepository(db);

  return {
    authService:      new AuthService(userRepo),
    postService:      new PostService(postRepo, userRepo),
    apiKeyService:    new ApiKeyService(apiKeyRepo),
    analyticsService: new AnalyticsService(analyticsRepo, postRepo),
  };
}
```

Both `packages/api/src/index.ts` and `packages/mcp/src/index.ts` call `createServiceContainer(db)` exactly once and pass the result into their respective app factories. This is the enforcement mechanism for the "no duplicated logic" requirement.

---

## Validation Rules (service level)

All input validation uses Zod schemas from `@quill/shared`. The service layer calls `schema.parse(input)` and wraps any `ZodError` in `AppError('VALIDATION_ERROR', 400)`.

| Field | Rule |
|---|---|
| `title` | 1–200 chars |
| `content` | Non-empty string |
| `excerpt` | Max 500 chars |
| `seo_title` | Max 60 chars |
| `seo_description` | Max 160 chars |
| `seo_keywords` | Max 200 chars total |
| `canonical_url` | Valid `https://` URL or null |
| `scheduled_for` | ISO 8601, must be future |
| `page` | Integer >= 1 |
| `limit` | Integer 1–100 |
| API key `name` | 1–64 chars |

---

## Error Catalogue (service-thrown AppErrors)

| Code | HTTP | Thrown by |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Any service on bad input |
| `POST_NOT_FOUND` | 404 | `getPost`, `updatePost`, `deletePost`, etc. |
| `FORBIDDEN` | 403 | Any ownership check failure |
| `ALREADY_PUBLISHED` | 409 | `publishPost` |
| `ALREADY_DRAFT` | 409 | `unpublishPost` |
| `INVALID_SCHEDULE_TIME` | 400 | `schedulePost` |
| `INVALID_DATE` | 400 | `schedulePost`, `parseISOString` |
| `USER_NOT_FOUND` | 404 | `getPublicPosts`, `getPublicPost` |
| `EMAIL_TAKEN` | 409 | `AuthService.register` |
| `USERNAME_TAKEN` | 409 | `AuthService.register` |
| `INVALID_CREDENTIALS` | 401 | `AuthService.login` |
| `INVALID_API_KEY` | 401 | `ApiKeyService.verifyKey` |
| `KEY_NOT_FOUND` | 404 | `ApiKeyService.revokeKey` |
| `SLUG_CONFLICT` | 409 | Internal (auto-resolved, not thrown to caller) |

---

## Authentication Requirements

Services receive `userId: number` as a plain parameter. They do NOT know about sessions, cookies, or API keys. Authentication is resolved by the transport layer (API or MCP) before the service is called.

---

## Acceptance Criteria

- [ ] `PostService.createPost` generates a unique slug when the base slug already exists.
- [ ] `PostService.publishPost` throws `ALREADY_PUBLISHED` when called on a published post.
- [ ] `PostService.schedulePost` throws `INVALID_SCHEDULE_TIME` for a past datetime.
- [ ] `PostService.unpublishPost` reverts published and scheduled posts to draft.
- [ ] `PostService.manageSeo` performs a partial merge (unset fields are preserved).
- [ ] All methods throw `FORBIDDEN` (not `POST_NOT_FOUND`) when a valid post belongs to another user.
- [ ] `AnalyticsService.getPostAnalytics` enforces ownership before querying.
- [ ] `createServiceContainer` wires repositories into services correctly.
- [ ] Calling `createServiceContainer` twice with the same DB produces two independent containers.
- [ ] All services are fully testable with mock repositories (no real DB required).

---

## Tests Required

| Test | Type | Description |
|---|---|---|
| `createPost` — new slug | Unit | Slug generated correctly |
| `createPost` — slug collision | Unit | Unique suffix appended |
| `createPost` — validation failure | Unit | Throws `VALIDATION_ERROR` |
| `updatePost` — success | Unit | Fields updated, `updated_at` refreshed |
| `updatePost` — wrong owner | Unit | Throws `FORBIDDEN` |
| `publishPost` — success | Unit | Status = published, published_at set |
| `publishPost` — already published | Unit | Throws `ALREADY_PUBLISHED` |
| `schedulePost` — future date | Unit | Status = scheduled |
| `schedulePost` — past date | Unit | Throws `INVALID_SCHEDULE_TIME` |
| `unpublishPost` — from published | Unit | Status = draft |
| `unpublishPost` — already draft | Unit | Throws `ALREADY_DRAFT` |
| `manageSeo` — partial update | Unit | Unset fields unchanged |
| `manageSeo` — bad canonical_url | Unit | Throws `VALIDATION_ERROR` |
| `getPublicPost` — not found | Unit | Throws `POST_NOT_FOUND` |
| `getPublicPosts` — unknown user | Unit | Throws `USER_NOT_FOUND` |
| `AnalyticsService.recordEvent` | Unit | Repository insert called |
| `AnalyticsService.getPostAnalytics` — wrong owner | Unit | Throws `FORBIDDEN` |
| `createServiceContainer` | Unit | Returns container with all services |

---

## Dependencies

- Spec 01 — `AppError`, `generateSlug`, `ensureUniqueSlug`, `parseISOString`, `isFuture`
- Spec 02 — All repository interfaces and row types
- Spec 03 — `AuthService`, `ApiKeyService` (partially in this spec by cross-reference)

---

## Implementation Tasks

- [ ] T-05-1: Define all service interfaces in `packages/services/src/types.ts`
- [ ] T-05-2: Implement `PostService` with all 9 methods
- [ ] T-05-3: Implement `AnalyticsService` with all 3 methods
- [ ] T-05-4: Implement `createServiceContainer` factory
- [ ] T-05-5: Export all interfaces, classes, and factory from `packages/services/src/index.ts`
- [ ] T-05-6: Write unit tests for `PostService` (all business rules)
- [ ] T-05-7: Write unit tests for `AnalyticsService`
- [ ] T-05-8: Verify `PostService` and `AnalyticsService` have zero direct DB imports

---

## Owner
**Dev B**
