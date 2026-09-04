# Spec 08 — Web Dashboard

## Objective
Define the complete React SPA that serves as the management interface for authenticated users. The dashboard enables users to write and manage posts, manage API keys, and view analytics. It communicates exclusively with the REST API defined in Spec 04 — it contains zero business logic and never imports server-side packages.

---

## Requirements

1. The dashboard MUST be a Vite + React 18 SPA living in `packages/web`.
2. All data fetching and mutation MUST use TanStack Query v5.
3. All server state lives in TanStack Query's cache — no Redux, Zustand, or other global state store.
4. Auth state (current user) MUST be held in a React context populated by `/api/auth/me` on app load.
5. Route protection MUST redirect unauthenticated users to `/login`.
6. All forms MUST use `react-hook-form` with Zod resolver; schemas imported from `@quill/shared`.
7. The dashboard MUST NEVER import from `@quill/database`, `@quill/services`, `@quill/api`, or `@quill/mcp`.
8. All API calls MUST go through typed fetch wrappers in `packages/web/src/api/`.
9. The UI MUST be built with Tailwind CSS.
10. The dashboard MUST be fully accessible (keyboard navigable, ARIA labels on interactive elements, sufficient colour contrast).
11. All destructive actions (delete post, revoke key) MUST require a confirmation step.
12. The post editor MUST support Markdown with a live preview pane.

---

## Page and Route Structure

| Route | Page Component | Auth Required | Description |
|---|---|---|---|
| `/login` | `LoginPage` | No (redirects to `/dashboard` if already authed) | Email + password login |
| `/register` | `RegisterPage` | No | New account creation |
| `/dashboard` | `DashboardPage` | Yes | Overview: recent posts, quick-stats |
| `/dashboard/posts` | `PostsListPage` | Yes | Paginated post list with filters |
| `/dashboard/posts/new` | `PostEditorPage` | Yes | Create new post |
| `/dashboard/posts/:id` | `PostEditorPage` | Yes | Edit existing post |
| `/dashboard/analytics` | `AnalyticsPage` | Yes | Charts and top posts |
| `/dashboard/keys` | `ApiKeysPage` | Yes | Manage API keys |
| `/dashboard/settings` | `SettingsPage` | Yes | Profile (display name, bio) |
| `*` | `NotFoundPage` | — | 404 fallback |

---

## Component Tree (high level)

```
App
├── AuthProvider           ← wraps everything, loads /api/auth/me
├── Router
│   ├── PublicRoute        ← redirects to /dashboard if authed
│   │   ├── LoginPage
│   │   └── RegisterPage
│   └── ProtectedRoute     ← redirects to /login if not authed
│       └── DashboardLayout
│           ├── Sidebar
│           ├── TopBar
│           └── Outlet
│               ├── DashboardPage
│               ├── PostsListPage
│               ├── PostEditorPage
│               ├── AnalyticsPage
│               ├── ApiKeysPage
│               └── SettingsPage
└── NotFoundPage
```

---

## Pages — Detailed Specification

### `LoginPage`

**Purpose:** Authenticate an existing user.

**Form fields:**
- `email` — text input, required, email format
- `password` — password input, required

**On submit:** `POST /api/auth/login`

**On success:** Invalidate `auth` query, navigate to `/dashboard`.

**On error `INVALID_CREDENTIALS`:** Show inline error "Invalid email or password."

**Validation:** Zod schema from `@quill/shared` → `loginSchema`.

---

### `RegisterPage`

**Purpose:** Create a new account.

**Form fields:**
- `username` — text, 3–30 chars, `^[a-zA-Z0-9_]+$`
- `email` — email
- `password` — password, min 8 chars
- `confirmPassword` — must match password (client-only validation)

**On submit:** `POST /api/auth/register`

**On success:** Auto-login (call login endpoint), navigate to `/dashboard`.

**On error `EMAIL_TAKEN` / `USERNAME_TAKEN`:** Show field-level error.

---

### `DashboardPage`

**Purpose:** Home screen overview.

**Content:**
- Welcome banner with user's display name / username
- "Quick stats" cards: total posts, published posts, total views (last 30d)
- Recent posts list (last 5, with status badge and quick-publish button)
- "Create your first post" empty state if no posts exist

**Data fetched:**
- `GET /api/posts?page=1&limit=5`
- `GET /api/analytics?range=30d`

---

### `PostsListPage`

**Purpose:** Browse and manage all posts.

**Features:**
- Paginated table/card list of posts
- Filter by status (All / Draft / Published / Scheduled) via tab bar
- Per-row actions: Edit, Publish/Unpublish, Delete
- "New Post" button → navigates to `/dashboard/posts/new`
- Delete triggers `ConfirmationDialog` before calling `DELETE /api/posts/:id`

**Data fetched:** `GET /api/posts?status=...&page=...&limit=20`

**Mutations:**
- `POST /api/posts/:id/publish`
- `POST /api/posts/:id/unpublish`
- `DELETE /api/posts/:id`

**On mutation success:** Invalidate `posts` query.

---

### `PostEditorPage`

**Purpose:** Create or edit a post with full Markdown editing and SEO.

**Modes:**
- **Create** (`/dashboard/posts/new`): blank form, `POST /api/posts` on save
- **Edit** (`/dashboard/posts/:id`): pre-populated from `GET /api/posts/:id`, `PUT /api/posts/:id` on save

**Layout:** Two-column split — editor on left, preview on right (collapsible on mobile).

**Tabs within the editor:**
1. **Content** — title input + Markdown textarea
2. **SEO** — seo_title, seo_description, seo_keywords, canonical_url inputs with character counters
3. **Publish** — status badge, publish / schedule / unpublish buttons

**Content tab fields:**
- `title` — text, 1–200 chars
- `excerpt` — textarea, max 500 chars (optional, shown in listings)
- `content` — Markdown textarea with live preview; rendered via `marked` + `DOMPurify`

**SEO tab fields:**
- `seo_title` — text, max 60 chars (character counter shown)
- `seo_description` — textarea, max 160 chars (character counter shown)
- `seo_keywords` — text, comma-separated, max 200 chars
- `canonical_url` — URL input, must be https://

**Publish tab:**
- Current status badge
- "Save Draft" button (always visible)
- "Publish Now" button (only when status ≠ published)
- "Schedule" button → opens `ScheduleDialog` with datetime picker
- "Unpublish" button (only when status = published or scheduled)

**Auto-save:** Draft posts are auto-saved after 3 seconds of inactivity (debounced `PUT /api/posts/:id`).

**Dirty-state guard:** Warn user before navigating away with unsaved changes.

---

### `ApiKeysPage`

**Purpose:** Manage MCP API keys.

**Features:**
- List of all keys with name, prefix, last used date, and status badge (Active / Revoked)
- "Create Key" button → opens `CreateKeyDialog`
- Each active key has a "Revoke" button → triggers `ConfirmationDialog`
- After key creation, display the full raw key in a copyable alert once, with explicit warning "This key will not be shown again"

**Data fetched:** `GET /api/keys`

**Mutations:**
- `POST /api/keys` — creates key
- `DELETE /api/keys/:id` — revokes key

**MCP setup instructions:** Static panel showing how to configure Cursor, Claude Code, or Windsurf with the MCP URL and key.

---

### `SettingsPage`

**Purpose:** Edit user profile.

**Form fields:**
- `display_name` — text, optional, max 100 chars
- `bio` — textarea, optional, max 500 chars

**On submit:** `PUT /api/auth/me` (profile update endpoint — add to Spec 04 if not present).

---

## Typed API Client (`packages/web/src/api/`)

All API calls use a central `apiFetch` utility:

```typescript
// packages/web/src/api/client.ts
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',  // send session cookie
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  const body = await res.json();
  if (!body.success) throw new ApiError(body.error.code, body.error.message, res.status);
  return body.data as T;
}
```

Individual API modules:

```
packages/web/src/api/
├── client.ts       ← apiFetch, ApiError class
├── auth.api.ts     ← login, logout, register, getMe
├── posts.api.ts    ← listPosts, getPost, createPost, updatePost, deletePost,
│                      publishPost, unpublishPost, schedulePost, updateSeo
├── apiKeys.api.ts  ← listKeys, createKey, revokeKey
└── analytics.api.ts ← getAccountAnalytics, getPostAnalytics
```

---

## TanStack Query Key Convention

```typescript
// Stable, predictable query keys
const queryKeys = {
  auth:           ['auth', 'me'],
  posts:          (filters) => ['posts', filters],
  post:           (id) => ['posts', id],
  analytics:      (range) => ['analytics', range],
  postAnalytics:  (postId, range) => ['analytics', 'post', postId, range],
  apiKeys:        ['apiKeys'],
};
```

---

## Shared UI Components

```
packages/web/src/components/
├── ui/
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Textarea.tsx
│   ├── Badge.tsx           ← status badges (draft/published/scheduled)
│   ├── Card.tsx
│   ├── Dialog.tsx          ← base modal
│   ├── ConfirmationDialog.tsx
│   ├── Spinner.tsx
│   └── EmptyState.tsx
├── layout/
│   ├── DashboardLayout.tsx
│   ├── Sidebar.tsx
│   └── TopBar.tsx
├── posts/
│   ├── PostCard.tsx
│   ├── PostStatusBadge.tsx
│   └── MarkdownPreview.tsx
├── analytics/
│   └── StatsCard.tsx
└── auth/
    └── AuthGuard.tsx
```

---

## Validation Rules

All form validation uses Zod schemas from `@quill/shared` via `react-hook-form` Zod resolver. Client-side validation mirrors server-side rules exactly. Server errors that slip through (e.g., slug collision) are surfaced as toast notifications.

---

## Authentication Requirements

- `AuthProvider` fetches `GET /api/auth/me` on mount. Result stored in React context.
- `ProtectedRoute` checks auth context; redirects to `/login` if `user` is null.
- On 401 response from any API call, the client clears auth context and redirects to `/login`.
- The `credentials: 'include'` option on all fetch calls sends the session cookie.

---

## Error Handling

| Scenario | UI behaviour |
|---|---|
| Network error | Toast: "Network error — please check your connection" |
| 401 from any endpoint | Clear session, redirect to `/login` |
| 403 FORBIDDEN | Toast: "You don't have permission to do that" |
| 404 POST_NOT_FOUND | Navigate to `/dashboard/posts` with toast "Post not found" |
| 409 ALREADY_PUBLISHED | Toast: "This post is already published" |
| 422/400 VALIDATION_ERROR | Field-level error from react-hook-form |
| 500 INTERNAL_ERROR | Toast: "Something went wrong — try again" |

---

## Acceptance Criteria

- [ ] Unauthenticated visit to `/dashboard` redirects to `/login`.
- [ ] Login sets session and shows the dashboard.
- [ ] Logout clears session and redirects to `/login`.
- [ ] Creating a post navigates to the edit page with the new post pre-loaded.
- [ ] Publishing a post updates its status badge without a full page reload.
- [ ] Deleting a post requires confirmation and removes the post from the list.
- [ ] API key creation displays the full raw key once with a copy button.
- [ ] Revoking a key requires confirmation and marks the key as revoked in the list.
- [ ] The Markdown preview re-renders on every keystroke.
- [ ] SEO character counters update in real time.
- [ ] Auto-save fires after 3 seconds of inactivity on a draft post.
- [ ] Navigating away with unsaved changes shows a warning.
- [ ] All forms show inline validation errors before submitting.

---

## Tests Required

| Test | Type | Description |
|---|---|---|
| `AuthProvider` — loads user | Unit | `/api/auth/me` called on mount |
| `ProtectedRoute` — unauthenticated | Unit | Redirects to `/login` |
| `LoginPage` — success | Unit | Calls API, navigates to dashboard |
| `LoginPage` — wrong credentials | Unit | Inline error shown |
| `PostsListPage` — renders list | Unit | Posts displayed from mocked API |
| `PostsListPage` — delete confirm | Unit | Confirmation dialog appears before delete |
| `PostEditorPage` — auto-save | Unit | PUT called after 3s debounce |
| `PostEditorPage` — dirty guard | Unit | Warning shown on nav-away |
| `ApiKeysPage` — show raw key once | Unit | Raw key visible after creation, gone on refetch |
| `apiFetch` — 401 response | Unit | Clears auth, redirects |
| `apiFetch` — non-ok response | Unit | Throws `ApiError` with correct code |

---

## Dependencies

- Spec 04 — REST API contract (all endpoint shapes)
- Spec 03 — Auth endpoints
- `@quill/shared` — Zod schemas for forms
- npm: `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`, `zod`, `marked`, `dompurify`, `tailwindcss`, `vite`, `@vitejs/plugin-react`

---

## Implementation Tasks

- [ ] T-08-1: Scaffold `packages/web` with Vite + React + Tailwind + TanStack Query
- [ ] T-08-2: Implement `apiFetch` client and `ApiError`
- [ ] T-08-3: Implement all 4 API client modules (`auth`, `posts`, `apiKeys`, `analytics`)
- [ ] T-08-4: Implement `AuthProvider` and `ProtectedRoute`
- [ ] T-08-5: Implement all shared UI components
- [ ] T-08-6: Implement `LoginPage` and `RegisterPage`
- [ ] T-08-7: Implement `DashboardLayout` (sidebar + topbar)
- [ ] T-08-8: Implement `DashboardPage` (overview)
- [ ] T-08-9: Implement `PostsListPage` with filters and actions
- [ ] T-08-10: Implement `PostEditorPage` with Markdown preview, SEO tab, auto-save
- [ ] T-08-11: Implement `ApiKeysPage` with create/revoke and one-time key display
- [ ] T-08-12: Implement `AnalyticsPage`
- [ ] T-08-13: Implement `SettingsPage`
- [ ] T-08-14: Write unit tests for all pages and critical components
- [ ] T-08-15: Verify ARIA labels on all interactive elements

---

## Owner
**Dev D**
