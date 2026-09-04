# Spec 10 — Analytics

## Objective
Define the complete analytics pipeline: event ingestion from the public blog, IP-based deduplication for unique views, aggregation queries, and the analytics dashboard UI. Analytics data MUST flow through the same shared `AnalyticsService` whether accessed via MCP tool or the web dashboard.

---

## Requirements

1. Every published post page load MUST trigger a `page_view` event.
2. Unique views MUST be determined server-side by hashing the requester's IP address + a daily salt. The raw IP MUST never be stored.
3. The event ingestion endpoint MUST be unauthenticated and MUST always return 200 (never expose whether a post exists).
4. `AnalyticsService` MUST be the single place where events are recorded and aggregated — no direct repository access from routes or tools.
5. Analytics queries MUST support four time ranges: `7d`, `30d`, `90d`, `all`.
6. Per-post analytics MUST be accessible via both the REST API (dashboard) and the `get_analytics` MCP tool, both calling the same service method.
7. The dashboard analytics page MUST display: total views, unique views, and a ranked list of top posts.
8. Analytics writes MUST be fire-and-forget from the client's perspective — they MUST NOT slow down page delivery.

---

## Event Ingestion Flow

```
Public blog page load
    │
    │  POST /api/public/:username/posts/:slug/view
    ▼
API route handler
    ├── Look up post (by username + slug)
    ├── Compute ip_hash = SHA-256(clientIp + dailySalt)
    ├── Determine event_type:
    │     query analytics_events WHERE ip_hash = ? AND post_id = ?
    │     AND created_at >= start_of_day(now)
    │     → if no row: 'unique_view'  (also inserts a 'page_view')
    │     → if found:  'page_view' only
    └── Call AnalyticsService.recordEvent(data)
        └── AnalyticsRepository.insert(row)
```

### IP Hashing

```typescript
// packages/api/src/routes/public.route.ts (analytics section)
import { createHash } from 'node:crypto';

function hashIp(ip: string, date: string): string {
  // date = YYYY-MM-DD (daily rotation ensures long-term privacy)
  return createHash('sha256').update(`${ip}:${date}`).digest('hex');
}

const clientIp = request.headers['x-forwarded-for']?.split(',')[0]?.trim()
               ?? request.socket.remoteAddress
               ?? 'unknown';
const dailySalt = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const ipHash = hashIp(clientIp, dailySalt);
```

**Privacy design:**
- The daily rotation means the same IP produces a different hash each day.
- No correlation is possible across days.
- Raw IPs are never written to the database.

---

## Data Model (from Spec 02)

```
analytics_events
  id          INTEGER PRIMARY KEY
  post_id     INTEGER  (FK → posts.id, ON DELETE SET NULL)
  user_id     INTEGER  (FK → users.id, ON DELETE SET NULL) — the post owner
  event_type  TEXT     CHECK IN ('page_view', 'unique_view')
  ip_hash     TEXT     — SHA-256(ip + date), never raw IP
  user_agent  TEXT
  referrer    TEXT
  created_at  TEXT     — ISO 8601 UTC
```

---

## `AnalyticsService` — Full Specification

```typescript
interface IAnalyticsService {
  recordEvent(data: RecordEventInput): void;
  getPostAnalytics(userId: number, postId: number, range: AnalyticsRange): PostAnalyticsResult;
  getAccountAnalytics(userId: number, range: AnalyticsRange): AccountAnalyticsResult;
}
```

### `recordEvent`

Input:
```typescript
type RecordEventInput = {
  postId:    number;
  userId:    number | null;      // post owner's userId (for query optimisation)
  eventType: 'page_view' | 'unique_view';
  ipHash?:   string;
  userAgent?: string;
  referrer?:  string;
};
```

Behaviour:
- Calls `AnalyticsRepository.insert(data)` directly.
- No validation beyond TypeScript types.
- Synchronous (better-sqlite3).

### `getPostAnalytics`

1. Verify ownership: call `PostRepository.findById(postId)`, check `post.user_id === userId`. Throw `AppError('FORBIDDEN', 403)` if mismatch.
2. Compute `{ from, to }` from `range` using `rangeToDateBounds`.
3. Call `AnalyticsRepository.countByPost(postId, from, to)`.
4. Return `PostAnalyticsResult`.

### `getAccountAnalytics`

1. Compute `{ from, to }` from `range`.
2. Call `AnalyticsRepository.countByUser(userId, from, to)` for totals.
3. Call `AnalyticsRepository.topPostsByUser(userId, from, to, limit: 10)` for rankings.
4. Return `AccountAnalyticsResult`.

---

## `AnalyticsRepository` — Query Specifications

### `insert`
```sql
INSERT INTO analytics_events (post_id, user_id, event_type, ip_hash, user_agent, referrer)
VALUES (?, ?, ?, ?, ?, ?);
```

### `countByPost`
```sql
SELECT
  COUNT(*) FILTER (WHERE event_type = 'page_view')   AS total_views,
  COUNT(*) FILTER (WHERE event_type = 'unique_view') AS unique_views
FROM analytics_events
WHERE post_id = ?
  AND created_at >= ?
  AND created_at <= ?;
```

### `countByUser`
```sql
SELECT
  COUNT(*) FILTER (WHERE ae.event_type = 'page_view')   AS total_views,
  COUNT(*) FILTER (WHERE ae.event_type = 'unique_view') AS unique_views
FROM analytics_events ae
WHERE ae.user_id = ?
  AND ae.created_at >= ?
  AND ae.created_at <= ?;
```

### `topPostsByUser`
```sql
SELECT
  ae.post_id,
  p.title,
  p.slug,
  COUNT(*) FILTER (WHERE ae.event_type = 'page_view')   AS total_views,
  COUNT(*) FILTER (WHERE ae.event_type = 'unique_view') AS unique_views
FROM analytics_events ae
JOIN posts p ON p.id = ae.post_id
WHERE ae.user_id = ?
  AND ae.created_at >= ?
  AND ae.created_at <= ?
GROUP BY ae.post_id
ORDER BY total_views DESC
LIMIT ?;
```

### `checkUniqueViewToday`
```sql
SELECT 1 FROM analytics_events
WHERE post_id = ?
  AND ip_hash = ?
  AND created_at >= ?   -- start of today UTC
LIMIT 1;
```

---

## Range-to-Date Conversion

```typescript
// packages/services/src/AnalyticsService.ts

function rangeToDateBounds(range: AnalyticsRange): { from: string; to: string } {
  const to = new Date();
  let from: Date;
  switch (range) {
    case '7d':  from = subDays(to, 7);  break;
    case '30d': from = subDays(to, 30); break;
    case '90d': from = subDays(to, 90); break;
    case 'all': from = new Date(0);      break;
  }
  return {
    from: from.toISOString(),
    to:   to.toISOString(),
  };
}

function subDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}
```

---

## REST API Endpoints (analytics-specific)

### `GET /api/analytics`
**Auth:** Session required  
**Query:** `range?: '7d' | '30d' | '90d' | 'all'` (default `'30d'`)  
**Calls:** `analyticsService.getAccountAnalytics(userId, range)`  
**Response 200:**
```json
{
  "success": true,
  "data": {
    "total_views": 5400,
    "unique_views": 3200,
    "range": "30d",
    "top_posts": [
      { "post_id": 1, "title": "...", "slug": "...", "total_views": 1200, "unique_views": 890 }
    ]
  }
}
```

### `GET /api/analytics/:postId`
**Auth:** Session required  
**Query:** `range?: '7d' | '30d' | '90d' | 'all'` (default `'30d'`)  
**Calls:** `analyticsService.getPostAnalytics(userId, postId, range)`  
**Response 200:**
```json
{
  "success": true,
  "data": {
    "post_id": 42,
    "title": "My Post",
    "slug": "my-post",
    "total_views": 1200,
    "unique_views": 890,
    "range": "30d"
  }
}
```
**Errors:** `POST_NOT_FOUND`, `FORBIDDEN`

### `POST /api/public/:username/posts/:slug/view`
**Auth:** None  
**Response:** Always `200 { "success": true }`  
**Server behaviour:**
1. Look up post by username + slug. If not found or not published → still return 200.
2. Compute `ipHash` and determine `eventType`.
3. Call `analyticsService.recordEvent(...)`.

---

## MCP Tool (cross-reference)

`get_analytics` tool (defined in Spec 07) calls:
- `analyticsService.getPostAnalytics(context.userId, post_id, range)` when `post_id` is given
- `analyticsService.getAccountAnalytics(context.userId, range)` otherwise

This is the same service method as the REST API. No analytics logic exists in the tool handler.

---

## Dashboard Analytics Page

### `AnalyticsPage` (`/dashboard/analytics`)

**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│  Range selector:  [7d]  [30d]  [90d]  [All time]         │
├──────────────┬──────────────────────────────────────────┤
│ Total Views  │  Unique Views                             │
│    5,400     │     3,200                                 │
├──────────────┴──────────────────────────────────────────┤
│  Top Posts                                               │
│  ┌─────────────────────────────────────────────────┐    │
│  │ #  Title            Total Views  Unique Views   │    │
│  │ 1. My First Post       1,200        890         │    │
│  └─────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

**Range selector:** Clicking a range button updates the `range` query param and triggers a new API call.

**Stats cards:** Formatted numbers with comma separators.

**Top posts table:** Clickable post titles link to `/dashboard/posts/:id` for editing.

**Empty state:** "No analytics data for this period." shown when `total_views === 0`.

**Data fetched:** `GET /api/analytics?range=30d`

---

## Validation Rules

- `range` parameter: must be one of `7d`, `30d`, `90d`, `all`. Invalid values default to `30d`.
- `postId` parameter: must be a positive integer.
- The view ingestion endpoint performs NO input validation on the client IP or user agent (both are optional).

---

## Authentication Requirements

- `/api/analytics` and `/api/analytics/:postId` require session auth.
- `get_analytics` MCP tool requires API key auth (resolved to userId by middleware).
- `/api/public/:username/posts/:slug/view` requires no auth.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| `getPostAnalytics` on another user's post | `AppError('FORBIDDEN', 403)` |
| `getPostAnalytics` on non-existent post | `AppError('POST_NOT_FOUND', 404)` |
| View event for non-existent post | Silently ignored (still returns 200) |
| View event fails (DB error) | Logged server-side; always returns 200 to client |
| Invalid `range` value | Defaults to `30d` |

---

## Acceptance Criteria

- [ ] A page view on `/blog/:username/:slug` inserts a row in `analytics_events`.
- [ ] Two page views from the same IP on the same day insert one `unique_view` and two `page_view` events.
- [ ] Two page views from the same IP on different days each insert a `unique_view`.
- [ ] `GET /api/analytics` returns correct totals for the authenticated user's posts.
- [ ] `GET /api/analytics/:postId` returns 403 for a post owned by a different user.
- [ ] `get_analytics` MCP tool returns the same data as the REST endpoint for identical inputs.
- [ ] Raw IP addresses are never stored in the database.
- [ ] The view ingestion endpoint always returns 200 even for non-existent posts.
- [ ] The `AnalyticsPage` updates data when a different range is selected.

---

## Tests Required

| Test | Type | Description |
|---|---|---|
| `recordEvent` — inserts row | Unit | Repository insert called with correct data |
| `getPostAnalytics` — ownership | Unit | Throws FORBIDDEN for wrong owner |
| `getPostAnalytics` — not found | Unit | Throws POST_NOT_FOUND |
| `getAccountAnalytics` — range 7d | Unit | Correct date bounds passed to repo |
| `rangeToDateBounds` — all ranges | Unit | Correct from/to dates for each range |
| IP hashing — same ip + date | Unit | Same hash produced |
| IP hashing — same ip + next day | Unit | Different hash produced |
| View endpoint — new visitor | Integration | unique_view + page_view inserted |
| View endpoint — return visitor | Integration | Only page_view inserted |
| View endpoint — non-existent post | Integration | Returns 200, no row inserted |
| `GET /api/analytics` | Integration | Correct totals returned |
| `GET /api/analytics/:postId` wrong owner | Integration | 403 |
| `AnalyticsPage` — renders stats | Unit | Cards show correct values |
| `AnalyticsPage` — range change | Unit | New query fires on range click |

---

## Dependencies

- Spec 02 — `AnalyticsRepository`, `analytics_events` table
- Spec 04 — Analytics REST routes, view ingestion endpoint
- Spec 05 — `AnalyticsService` (specified here in detail)
- Spec 07 — `get_analytics` MCP tool
- Spec 08 — `AnalyticsPage` component

---

## Implementation Tasks

- [ ] T-10-1: Implement `checkUniqueViewToday` in `AnalyticsRepository`
- [ ] T-10-2: Implement all 4 `AnalyticsRepository` query methods
- [ ] T-10-3: Implement `AnalyticsService.recordEvent`
- [ ] T-10-4: Implement `AnalyticsService.getPostAnalytics` and `getAccountAnalytics`
- [ ] T-10-5: Implement `rangeToDateBounds` utility
- [ ] T-10-6: Implement IP hashing utility in API package
- [ ] T-10-7: Implement `POST /api/public/:username/posts/:slug/view` with unique/page logic
- [ ] T-10-8: Implement `GET /api/analytics` and `GET /api/analytics/:postId` routes
- [ ] T-10-9: Implement `AnalyticsPage` component in `packages/web`
- [ ] T-10-10: Write unit tests for `AnalyticsService`
- [ ] T-10-11: Write integration tests for view ingestion and analytics queries
- [ ] T-10-12: Verify raw IPs never appear in DB (automated assertion in integration test)

---

## Owner
**Dev B** (service + repository) + **Dev C** (API routes) + **Dev D** (UI)
