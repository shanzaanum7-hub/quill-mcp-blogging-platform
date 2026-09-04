# Spec 04 — REST / API Layer

## Objective
Define the complete Fastify HTTP server that serves both the web dashboard and any external HTTP consumers. All business logic is delegated to the shared service layer. This package is responsible only for: request parsing, input validation, auth enforcement, response shaping, and error formatting.

---

## Requirements

1. The API server MUST be a Fastify 4 application created via a factory function (`createApp`) so it can be instantiated in tests without side effects.
2. Every route MUST declare a Fastify JSON Schema for request body, query string, and params — invalid requests are rejected before reaching the service layer.
3. All responses MUST follow a uniform envelope: `{ "success": true, "data": ... }` or `{ "success": false, "error": { "code": "...", "message": "..." } }`.
4. All authenticated dashboard routes MUST use the `requireSession` preHandler from Spec 03.
5. Public read-only routes MUST be rate-limited independently from authenticated routes.
6. The `/health` endpoint MUST be unauthenticated and MUST return database connectivity status.
7. CORS MUST be configured from the `CORS_ORIGINS` environment variable.
8. The server MUST log every request and error using Fastify's built-in Pino logger at the configured `LOG_LEVEL`.
9. A global error handler MUST catch all `AppError` instances and map them to the correct HTTP status code. Unhandled errors MUST return `500 INTERNAL_ERROR` without leaking stack traces in production.
10. The API server MUST NOT contain any SQL or direct database access. All data operations go through the service layer.

---

## Server Factory

```typescript
// packages/api/src/server.ts
export async function createApp(services: ServiceContainer): Promise<FastifyInstance>
```

`ServiceContainer` is a plain object holding every service instance:
```typescript
type ServiceContainer = {
  authService: IAuthService;
  postService: IPostService;
  apiKeyService: IApiKeyService;
  analyticsService: IAnalyticsService;
};
```

Services are constructed in `packages/api/src/index.ts` (the entry point) and injected into `createApp`. This makes every route handler fully testable with mocked services.

---

## Route Map

### Health
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | Liveness + DB check |

### Authentication
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | None | Create account |
| POST | `/api/auth/login` | None | Start session |
| POST | `/api/auth/logout` | Session | End session |
| GET | `/api/auth/me` | Session | Current user |

### Posts (dashboard)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/posts` | Session | List own posts |
| POST | `/api/posts` | Session | Create post |
| GET | `/api/posts/:id` | Session | Get own post |
| PUT | `/api/posts/:id` | Session | Update post |
| DELETE | `/api/posts/:id` | Session | Delete post |
| POST | `/api/posts/:id/publish` | Session | Publish post |
| POST | `/api/posts/:id/unpublish` | Session | Revert to draft |
| POST | `/api/posts/:id/schedule` | Session | Schedule post |
| PUT | `/api/posts/:id/seo` | Session | Update SEO fields |

### API Keys
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/keys` | Session | List own keys |
| POST | `/api/keys` | Session | Create key |
| DELETE | `/api/keys/:id` | Session | Revoke key |

### Analytics
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/analytics` | Session | Account-wide analytics |
| GET | `/api/analytics/:postId` | Session | Per-post analytics |

### Public (read-only, unauthenticated)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/public/:username/posts` | None | Published posts for a user |
| GET | `/api/public/:username/posts/:slug` | None | Single published post |

---

## API Contracts (request / response shapes)

### `GET /health`
**Response 200:**
```json
{
  "status": "ok",
  "db": "connected",
  "uptime": 42.3,
  "version": "1.0.0"
}
```
**Response 503** (DB unreachable):
```json
{ "status": "degraded", "db": "error", "uptime": 42.3, "version": "1.0.0" }
```

---

### `GET /api/posts`
**Query params:**
```
status?:  "draft" | "published" | "scheduled"
page?:    integer >= 1  (default 1)
limit?:   integer 1–100 (default 20)
```
**Response 200:**
```json
{
  "success": true,
  "data": {
    "posts": [ { ...PostSummary } ],
    "pagination": { "page": 1, "limit": 20, "total": 45, "totalPages": 3 }
  }
}
```

---

### `POST /api/posts`
**Body:**
```json
{
  "title":   "string, 1–200 chars, required",
  "content": "string, required",
  "excerpt": "string, max 500 chars, optional"
}
```
**Response 201:**
```json
{ "success": true, "data": { ...PostFull } }
```

---

### `PUT /api/posts/:id`
**Body (all fields optional, at least one required):**
```json
{
  "title":   "string, 1–200 chars",
  "content": "string",
  "excerpt": "string, max 500 chars"
}
```
**Response 200:**
```json
{ "success": true, "data": { ...PostFull } }
```

---

### `POST /api/posts/:id/schedule`
**Body:**
```json
{ "scheduled_for": "ISO 8601 UTC datetime, must be in the future" }
```
**Response 200:**
```json
{ "success": true, "data": { ...PostFull } }
```

---

### `PUT /api/posts/:id/seo`
**Body (all optional, at least one required):**
```json
{
  "seo_title":       "string, max 60 chars",
  "seo_description": "string, max 160 chars",
  "seo_keywords":    "string, comma-separated, max 200 chars total",
  "canonical_url":   "valid URL"
}
```
**Response 200:**
```json
{ "success": true, "data": { ...PostFull } }
```

---

### `GET /api/analytics`
**Query params:**
```
range?: "7d" | "30d" | "90d" | "all"  (default "30d")
```
**Response 200:**
```json
{
  "success": true,
  "data": {
    "total_views": 1234,
    "unique_views": 876,
    "top_posts": [
      { "post_id": 1, "title": "...", "slug": "...", "total_views": 400, "unique_views": 310 }
    ]
  }
}
```

---

### `GET /api/public/:username/posts`
**Query params:**
```
page?:  integer >= 1  (default 1)
limit?: integer 1–20  (default 10, max 20)
```
**Response 200:**
```json
{
  "success": true,
  "data": {
    "author": { "username": "alice", "display_name": "Alice", "bio": "..." },
    "posts": [ { ...PostPublic } ],
    "pagination": { "page": 1, "limit": 10, "total": 8, "totalPages": 1 }
  }
}
```

---

## Response Shape Definitions

```typescript
type PostSummary = {
  id: number;
  title: string;
  slug: string;
  status: 'draft' | 'published' | 'scheduled';
  excerpt: string | null;
  published_at: string | null;
  scheduled_for: string | null;
  created_at: string;
  updated_at: string;
};

type PostFull = PostSummary & {
  content: string;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  canonical_url: string | null;
};

type PostPublic = {
  title: string;
  slug: string;
  excerpt: string | null;
  published_at: string;
  content: string;
  seo_title: string | null;
  seo_description: string | null;
};
```

---

## Plugins (registration order)

```
1. @fastify/cors          — configured from CORS_ORIGINS env var
2. @fastify/cookie        — required for session
3. @fastify/session       — session management
4. @fastify/rate-limit    — global defaults; overridden per-route group
5. errorHandler plugin    — global AppError → HTTP response mapper
6. auth plugin            — decorates request with .auth context
7. routes                 — registered last
```

---

## Error Handler Behaviour

```typescript
// packages/api/src/plugins/errorHandler.plugin.ts
fastify.setErrorHandler((error, request, reply) => {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      success: false,
      error: { code: error.code, message: error.message }
    });
  }
  if (error.validation) {
    // Fastify schema validation error
    return reply.status(400).send({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: error.message }
    });
  }
  // Unhandled — log full error, return generic message
  request.log.error(error);
  return reply.status(500).send({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }
  });
});
```

---

## Rate Limiting

| Route group | Limit | Window |
|---|---|---|
| Public blog routes | 60 req | per minute per IP |
| Auth routes (login/register) | 10 req | per minute per IP |
| Authenticated dashboard routes | 120 req | per minute per session userId |
| `/health` | 300 req | per minute per IP |

---

## Validation Rules

All request validation uses Fastify's JSON Schema integration (schemas derived from `@quill/shared` Zod schemas and converted via `zod-to-json-schema`).

| Field | Rule |
|---|---|
| Post `title` | 1–200 chars, non-empty |
| Post `content` | Non-empty string |
| Post `excerpt` | Max 500 chars |
| `seo_title` | Max 60 chars |
| `seo_description` | Max 160 chars |
| `canonical_url` | Must be a valid `https://` URL |
| `scheduled_for` | ISO 8601, must be in the future |
| `page` | Integer >= 1 |
| `limit` | Integer 1–100 (public routes max 20) |
| `:id` params | Positive integer |

---

## Authentication Requirements

- All `/api/posts/*`, `/api/keys/*`, `/api/analytics/*`, `/api/auth/logout`, `/api/auth/me` require `requireSession`.
- `/api/public/*` requires no authentication.
- `/health` requires no authentication.
- `/api/auth/register` and `/api/auth/login` require no authentication but are rate-limited more strictly.

---

## Error Handling

| Scenario | Code | HTTP |
|---|---|---|
| Route not found | `NOT_FOUND` | 404 |
| Method not allowed | `METHOD_NOT_ALLOWED` | 405 |
| Request body validation fails | `VALIDATION_ERROR` | 400 |
| Query param validation fails | `VALIDATION_ERROR` | 400 |
| Post not found | `POST_NOT_FOUND` | 404 |
| Post belongs to another user | `FORBIDDEN` | 403 |
| Post already published | `ALREADY_PUBLISHED` | 409 |
| `scheduled_for` in the past | `INVALID_SCHEDULE_TIME` | 400 |
| DB error (unexpected) | `INTERNAL_ERROR` | 500 |

---

## Acceptance Criteria

- [ ] `createApp(services)` starts without error when all services are provided.
- [ ] `GET /health` returns 200 with `db: "connected"` when DB is reachable.
- [ ] Every authenticated route returns 401 when session cookie is absent.
- [ ] Invalid request body returns 400 `VALIDATION_ERROR` before hitting the service.
- [ ] `POST /api/posts` returns 201 with the created post on success.
- [ ] `DELETE /api/posts/:id` returns 403 when the post belongs to a different user.
- [ ] Public routes are accessible without authentication.
- [ ] All responses follow the `{ success, data }` / `{ success, error }` envelope.
- [ ] Stack traces are never present in production error responses.
- [ ] Rate limit headers (`X-RateLimit-*`) are present on all responses.

---

## Tests Required

| Test | Type | Description |
|---|---|---|
| `GET /health` — DB ok | Integration | Returns 200 `{ status: "ok" }` |
| `GET /health` — DB down | Integration | Returns 503 `{ status: "degraded" }` |
| `POST /api/posts` — valid | Integration | 201, post in response |
| `POST /api/posts` — missing title | Integration | 400 `VALIDATION_ERROR` |
| `GET /api/posts` — paginated | Integration | Correct page/total returned |
| `PUT /api/posts/:id` — wrong owner | Integration | 403 `FORBIDDEN` |
| `DELETE /api/posts/:id` — not found | Integration | 404 `POST_NOT_FOUND` |
| `POST /api/posts/:id/schedule` — past date | Integration | 400 `INVALID_SCHEDULE_TIME` |
| `GET /api/public/:username/posts` — no auth | Integration | 200 with published posts |
| Error handler — `AppError` | Unit | Correct status + code |
| Error handler — unhandled error | Unit | 500 no stack trace |
| Rate limit | Integration | 429 after threshold |

---

## Dependencies

- Spec 01 — `AppError`, env utils
- Spec 02 — Database client (for `/health` DB check)
- Spec 03 — Auth middleware, `AuthService`, `ApiKeyService`
- Spec 05 — `PostService`, `AnalyticsService` (interfaces needed before routes can be completed)
- npm: `fastify`, `@fastify/cors`, `@fastify/cookie`, `@fastify/session`, `@fastify/rate-limit`, `zod-to-json-schema`

---

## Implementation Tasks

- [ ] T-04-1: Implement `createApp` factory with plugin registration order
- [ ] T-04-2: Implement global error handler plugin
- [ ] T-04-3: Implement `GET /health` route
- [ ] T-04-4: Implement auth routes (register, login, logout, me)
- [ ] T-04-5: Implement post routes (CRUD + publish/unpublish/schedule/seo)
- [ ] T-04-6: Implement API key routes
- [ ] T-04-7: Implement analytics routes
- [ ] T-04-8: Implement public routes
- [ ] T-04-9: Add rate limiting per route group
- [ ] T-04-10: Wire `ServiceContainer` injection in `index.ts` entry point
- [ ] T-04-11: Write all integration tests using Fastify `inject()`
- [ ] T-04-12: Verify all routes reject unauthenticated requests correctly

---

## Owner
**Dev C**
