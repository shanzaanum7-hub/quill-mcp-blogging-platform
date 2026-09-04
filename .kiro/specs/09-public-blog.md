# Spec 09 — Public Blog

## Objective
Define the read-only public-facing blog UI that renders published posts for any visitor without authentication. The blog fetches data from the public API endpoints defined in Spec 04 and renders Markdown content safely.

---

## Requirements

1. The public blog MUST be a separate Vite + React SPA in `packages/blog`.
2. It MUST communicate only with `/api/public/*` endpoints — no authenticated endpoints.
3. It MUST render Markdown content using `marked` + `DOMPurify` (same libraries as the dashboard).
4. All pages MUST include appropriate `<meta>` tags for SEO using the post's stored SEO fields.
5. The blog MUST be usable without JavaScript (progressive enhancement goal — acceptable for MVP to be JS-required, but HTML must be semantic).
6. The blog MUST have no dependency on any server-side package (`@quill/database`, `@quill/services`, etc.).
7. Pages MUST handle loading, empty, and error states gracefully.
8. The blog MUST be deployable as a static SPA served by Nginx.
9. Analytics page view events MUST be fired on every post page load via `POST /api/public/:username/posts/:slug/view` (add this endpoint to Spec 04).

---

## Route Structure

| Route | Page Component | Description |
|---|---|---|
| `/blog` | `BlogHomePage` | Platform landing — lists all authors / recent posts |
| `/blog/:username` | `AuthorPage` | Author's blog — lists their published posts |
| `/blog/:username/:slug` | `PostPage` | Single published post |
| `*` | `NotFoundPage` | 404 for unmatched routes |

---

## Pages — Detailed Specification

### `BlogHomePage` (`/blog`)

**Purpose:** Platform-level landing page. Shows recent posts across all users, or a curated list.

**Content:**
- Platform name "Quill" and tagline
- List of recently published posts (across all users) — title, author username, excerpt, published date
- Pagination controls

**Data fetched:** `GET /api/public/feed?page=1&limit=10`

> Note: A `/api/public/feed` endpoint must be added to Spec 04. It returns the most recent published posts across all users, sorted by `published_at` descending.

**Empty state:** "No posts published yet."

---

### `AuthorPage` (`/blog/:username`)

**Purpose:** Individual author's blog listing page.

**Content:**
- Author header: display name (or username), bio, link to their posts
- Paginated list of published posts: title, excerpt, published date, estimated read time
- Pagination controls

**Data fetched:** `GET /api/public/:username/posts?page=...&limit=10`

**Empty state:** "This author hasn't published any posts yet."

**Error state (404):** "Author not found." with a link back to `/blog`.

---

### `PostPage` (`/blog/:username/:slug`)

**Purpose:** Render a single published post with full content.

**Content:**
- Post title (`<h1>`)
- Author name (linked to `/blog/:username`)
- Published date (human-readable and `<time datetime="...">` for accessibility)
- Estimated read time (calculated client-side: `Math.ceil(wordCount / 200)` minutes)
- Rendered Markdown content (sanitised)
- SEO meta tags (see SEO section below)
- Back link to author page

**Data fetched:** `GET /api/public/:username/posts/:slug`

**On mount:** Fire analytics event via `POST /api/public/:username/posts/:slug/view` (fire-and-forget, errors silently ignored).

**Error state (404):** "Post not found." with link back to author page.

---

## SEO Meta Tag Specification

Every `PostPage` MUST inject the following into `<head>` using React Helmet (or Vite's equivalent):

```html
<title>{seo_title || post.title} | Quill</title>
<meta name="description" content="{seo_description || post.excerpt || ''}" />
<meta name="keywords" content="{seo_keywords || ''}" />
<link rel="canonical" href="{canonical_url || current_url}" />

<!-- Open Graph -->
<meta property="og:title" content="{seo_title || post.title}" />
<meta property="og:description" content="{seo_description || post.excerpt || ''}" />
<meta property="og:type" content="article" />
<meta property="og:url" content="{canonical_url || current_url}" />

<!-- Article metadata -->
<meta property="article:published_time" content="{post.published_at}" />
<meta property="article:author" content="{username}" />
```

For `AuthorPage`:
```html
<title>{display_name || username}'s Blog | Quill</title>
<meta name="description" content="{bio || ''}" />
```

---

## Analytics Tracking

On every `PostPage` mount:
```typescript
// Fire and forget — never block render or show errors to the user
fetch(`/api/public/${username}/posts/${slug}/view`, { method: 'POST' })
  .catch(() => {/* silently ignore */});
```

The server determines `event_type` (`page_view` vs `unique_view`) based on IP hash.

---

## Public API Endpoints Required (additions to Spec 04)

| Method | Path | Description |
|---|---|---|
| GET | `/api/public/feed` | Recent posts across all users, sorted by published_at |
| POST | `/api/public/:username/posts/:slug/view` | Record page view event |

### `GET /api/public/feed`
**Query params:** `page` (default 1), `limit` (default 10, max 20)
**Response 200:**
```json
{
  "success": true,
  "data": {
    "posts": [
      {
        "title": "...",
        "slug": "...",
        "excerpt": "...",
        "published_at": "...",
        "author": { "username": "alice", "display_name": "Alice" }
      }
    ],
    "pagination": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
  }
}
```

### `POST /api/public/:username/posts/:slug/view`
**Auth:** None  
**Response 200:** `{ "success": true }`  
**Behaviour:** Server-side: look up post, call `AnalyticsService.recordEvent`. Always returns 200 (even if post not found) to avoid leaking information.

---

## Typed API Client (`packages/blog/src/api/`)

```typescript
// packages/blog/src/api/public.api.ts
export const publicApi = {
  getFeed(page: number, limit: number): Promise<FeedResult>,
  getAuthorPosts(username: string, page: number, limit: number): Promise<AuthorPostsResult>,
  getPost(username: string, slug: string): Promise<PostPublic>,
  recordView(username: string, slug: string): Promise<void>,
};
```

---

## Component Structure

```
packages/blog/src/
├── main.tsx
├── App.tsx
├── api/
│   └── public.api.ts
├── pages/
│   ├── BlogHomePage.tsx
│   ├── AuthorPage.tsx
│   ├── PostPage.tsx
│   └── NotFoundPage.tsx
├── components/
│   ├── PostCard.tsx          ← title, excerpt, author, date
│   ├── AuthorHeader.tsx      ← author name, bio
│   ├── RenderedContent.tsx   ← marked + DOMPurify output
│   ├── Pagination.tsx        ← prev/next + page number controls
│   ├── ReadingTime.tsx       ← estimated read time
│   ├── SeoHead.tsx           ← injects meta tags via react-helmet-async
│   └── Spinner.tsx
└── hooks/
    └── usePublicPost.ts
    └── useAuthorPosts.ts
```

---

## Markdown Rendering

The `RenderedContent` component:
```typescript
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export function RenderedContent({ markdown }: { markdown: string }) {
  const html = DOMPurify.sanitize(marked.parse(markdown) as string);
  return (
    <article
      className="prose prose-slate max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

DOMPurify MUST be configured to:
- Allow standard HTML elements: `p`, `h1`–`h6`, `ul`, `ol`, `li`, `blockquote`, `code`, `pre`, `a`, `strong`, `em`, `img`
- Strip `<script>`, `onerror`, `onload` and all event handler attributes
- Allow `href` only on `<a>` tags with `http://`, `https://`, and relative URLs

---

## Pagination Component

```typescript
type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};
```

Renders: Previous button, page numbers (current ± 2), Next button. Uses `aria-label` and `aria-current="page"`.

---

## Validation Rules

- The blog has no forms — no input validation required.
- URL params (`username`, `slug`) are passed directly to the API; the API handles 404s.
- `limit` for public routes is capped at 20 (enforced server-side, respected client-side by never requesting more).

---

## Error Handling

| Scenario | UI Behaviour |
|---|---|
| Author not found (404) | "Author not found" message with link to `/blog` |
| Post not found (404) | "Post not found" message with link back to author page |
| Network error | "Unable to load content — please try again" with retry button |
| Analytics event fails | Silently ignored — never shown to user |
| Markdown rendering throws | Render raw text as fallback |

---

## Authentication Requirements

None. All public blog routes are unauthenticated. The blog SPA sends no cookies and no `Authorization` headers.

---

## Acceptance Criteria

- [ ] `/blog` renders a list of recent published posts from all authors.
- [ ] `/blog/:username` renders only that author's published posts.
- [ ] `/blog/:username/:slug` renders the full post with Markdown content.
- [ ] Post pages inject correct `<title>` and `<meta description>` from SEO fields.
- [ ] Post pages fire a view event on mount (network tab shows the request).
- [ ] Visiting a non-existent author shows the 404 message, not a blank page.
- [ ] Visiting a non-existent post slug shows the 404 message.
- [ ] Markdown content with `<script>` tags renders without executing scripts.
- [ ] Pagination controls navigate correctly between pages.
- [ ] Estimated read time is displayed on the post page.
- [ ] The blog is fully usable without a user account.

---

## Tests Required

| Test | Type | Description |
|---|---|---|
| `BlogHomePage` — renders posts | Unit | Feed data displayed correctly |
| `BlogHomePage` — empty state | Unit | Correct empty message shown |
| `AuthorPage` — renders author | Unit | Author header + post list |
| `AuthorPage` — 404 author | Unit | Error message shown |
| `PostPage` — renders content | Unit | Markdown rendered in DOM |
| `PostPage` — fires view event | Unit | `recordView` called on mount |
| `PostPage` — SEO meta tags | Unit | `<title>` and `<meta>` tags injected |
| `RenderedContent` — XSS script | Unit | `<script>` stripped by DOMPurify |
| `RenderedContent` — XSS event handler | Unit | `onerror` attribute stripped |
| `Pagination` — prev/next | Unit | Correct callbacks fired |
| `publicApi.getPost` — 404 | Unit | Throws `ApiError` with 404 |

---

## Dependencies

- Spec 04 — Public API endpoints (including new `/api/public/feed` and `/:slug/view`)
- Spec 10 — Analytics event recording (server-side, triggered by view endpoint)
- `@quill/shared` — shared types only (no server code)
- npm: `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `marked`, `dompurify`, `react-helmet-async`, `tailwindcss`, `vite`, `@vitejs/plugin-react`

---

## Implementation Tasks

- [ ] T-09-1: Scaffold `packages/blog` with Vite + React + Tailwind
- [ ] T-09-2: Implement `publicApi` client module
- [ ] T-09-3: Implement `RenderedContent` with DOMPurify configuration
- [ ] T-09-4: Implement `SeoHead` component with all meta tags
- [ ] T-09-5: Implement `BlogHomePage`
- [ ] T-09-6: Implement `AuthorPage`
- [ ] T-09-7: Implement `PostPage` with analytics tracking
- [ ] T-09-8: Implement `Pagination` component
- [ ] T-09-9: Implement `NotFoundPage`
- [ ] T-09-10: Add `/api/public/feed` endpoint to `packages/api`
- [ ] T-09-11: Add `POST /api/public/:username/posts/:slug/view` endpoint to `packages/api`
- [ ] T-09-12: Write unit tests for all pages and `RenderedContent`
- [ ] T-09-13: Verify XSS sanitisation with malicious Markdown

---

## Owner
**Dev D**
