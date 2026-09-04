# Spec 07 — MCP Tools

## Objective
Define the complete specification for every MCP tool: its name, description, input schema, output shape, service delegation, and error handling. Tool handlers are thin adapters — they validate input, call one service method, and format the result. Zero business logic lives here.

---

## Requirements

1. Every tool MUST have a description string in plain English that clearly explains what it does, what inputs it takes, and what it returns. This description is shown to AI agents and MUST be precise.
2. Every tool input schema MUST be a Zod schema defined in `packages/shared/src/schemas/mcpTools.schema.ts`.
3. No tool MUST accept `user_id` as an input parameter.
4. Every tool handler MUST follow the pattern: validate → call service → return result.
5. Every tool MUST return `{ content: [{ type: 'text', text: JSON.stringify(data) }] }` on success.
6. Every tool MUST return `{ content: [{ type: 'text', text: 'Error: ...' }], isError: true }` on failure.
7. Tool handlers are exported from individual files in `packages/mcp/src/tools/`.

---

## Common Handler Pattern

```typescript
// Template for every tool handler
export function createXxxHandler(services: ServiceContainer) {
  return async (
    params: XxxInput,
    context: RequestContext
  ): Promise<CallToolResult> => {
    try {
      const result = await services.xxxService.xxxMethod(context.userId, params);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      };
    } catch (error) {
      const message = error instanceof AppError ? error.message : 'Internal error';
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true
      };
    }
  };
}
```

---

## Tool 1 — `create_post`

**File:** `packages/mcp/src/tools/createPost.tool.ts`

**Description for agents:**
> Creates a new blog post as a draft for the authenticated user. Returns the post ID, generated slug, and full post details. The post is saved as a draft and will not be publicly visible until `publish_post` or `schedule_post` is called.

**Input schema:**
```typescript
const createPostSchema = z.object({
  title:   z.string().min(1).max(200).describe('The post title'),
  content: z.string().min(1).describe('The post body in Markdown'),
  excerpt: z.string().max(500).optional().describe('Short summary shown in listings'),
});
```

**Service call:** `postService.createPost(userId, { title, content, excerpt })`

**Success output:**
```json
{
  "id": 42,
  "title": "My First Post",
  "slug": "my-first-post",
  "status": "draft",
  "excerpt": null,
  "content": "...",
  "created_at": "2026-09-01T10:00:00Z",
  "updated_at": "2026-09-01T10:00:00Z"
}
```

**Errors:** `VALIDATION_ERROR`

---

## Tool 2 — `update_post`

**File:** `packages/mcp/src/tools/updatePost.tool.ts`

**Description for agents:**
> Updates an existing blog post owned by the authenticated user. All fields are optional — only the provided fields will be updated. Returns the full updated post. The post must belong to the authenticated user.

**Input schema:**
```typescript
const updatePostSchema = z.object({
  post_id: z.number().int().positive().describe('The numeric post ID to update'),
  title:   z.string().min(1).max(200).optional().describe('New title'),
  content: z.string().min(1).optional().describe('New body in Markdown'),
  excerpt: z.string().max(500).optional().describe('New short summary'),
}).refine(
  (d) => d.title !== undefined || d.content !== undefined || d.excerpt !== undefined,
  { message: 'At least one of title, content, or excerpt must be provided' }
);
```

**Service call:** `postService.updatePost(userId, post_id, { title, content, excerpt })`

**Errors:** `POST_NOT_FOUND`, `FORBIDDEN`, `VALIDATION_ERROR`

---

## Tool 3 — `delete_post`

**File:** `packages/mcp/src/tools/deletePost.tool.ts`

**Description for agents:**
> Permanently deletes a blog post owned by the authenticated user. This action cannot be undone. Returns a confirmation message on success.

**Input schema:**
```typescript
const deletePostSchema = z.object({
  post_id: z.number().int().positive().describe('The numeric ID of the post to delete'),
});
```

**Service call:** `postService.deletePost(userId, post_id)`

**Success output:**
```json
{ "success": true, "message": "Post 42 deleted successfully." }
```

**Errors:** `POST_NOT_FOUND`, `FORBIDDEN`

---

## Tool 4 — `list_posts`

**File:** `packages/mcp/src/tools/listPosts.tool.ts`

**Description for agents:**
> Lists blog posts belonging to the authenticated user. Results can be filtered by status and are paginated. Returns post summaries (no full content body) with pagination metadata.

**Input schema:**
```typescript
const listPostsSchema = z.object({
  status: z.enum(['draft', 'published', 'scheduled']).optional()
            .describe('Filter by post status. Omit to return all statuses.'),
  page:   z.number().int().min(1).default(1).describe('Page number, starting at 1'),
  limit:  z.number().int().min(1).max(100).default(20).describe('Results per page, max 100'),
});
```

**Service call:** `postService.listPosts(userId, { status, page, limit })`

**Success output:**
```json
{
  "posts": [
    {
      "id": 42,
      "title": "My First Post",
      "slug": "my-first-post",
      "status": "draft",
      "excerpt": null,
      "published_at": null,
      "scheduled_for": null,
      "created_at": "2026-09-01T10:00:00Z",
      "updated_at": "2026-09-01T10:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

---

## Tool 5 — `get_post`

**File:** `packages/mcp/src/tools/getPost.tool.ts`

**Description for agents:**
> Retrieves the full details of a single blog post by ID, including its content body and SEO fields. The post must belong to the authenticated user.

**Input schema:**
```typescript
const getPostSchema = z.object({
  post_id: z.number().int().positive().describe('The numeric post ID to retrieve'),
});
```

**Service call:** `postService.getPost(userId, post_id)`

**Success output:** Full `PostFull` object including `content`, `seo_title`, `seo_description`, `seo_keywords`, `canonical_url`.

**Errors:** `POST_NOT_FOUND`, `FORBIDDEN`

---

## Tool 6 — `publish_post`

**File:** `packages/mcp/src/tools/publishPost.tool.ts`

**Description for agents:**
> Immediately publishes a blog post, making it publicly visible. The post status changes to "published" and `published_at` is set to the current time. Cannot be called on an already-published post.

**Input schema:**
```typescript
const publishPostSchema = z.object({
  post_id: z.number().int().positive().describe('The numeric ID of the post to publish'),
});
```

**Service call:** `postService.publishPost(userId, post_id)`

**Success output:** Full `PostFull` object with `status: "published"` and `published_at` set.

**Errors:** `POST_NOT_FOUND`, `FORBIDDEN`, `ALREADY_PUBLISHED`

---

## Tool 7 — `schedule_post`

**File:** `packages/mcp/src/tools/schedulePost.tool.ts`

**Description for agents:**
> Schedules a blog post to be automatically published at a specific future date and time. The datetime must be in ISO 8601 format (e.g. "2026-12-01T09:00:00Z") and must be in the future. Returns the updated post with status "scheduled".

**Input schema:**
```typescript
const schedulePostSchema = z.object({
  post_id:       z.number().int().positive()
                   .describe('The numeric ID of the post to schedule'),
  scheduled_for: z.string()
                   .describe('ISO 8601 UTC datetime for when to publish, e.g. "2026-12-01T09:00:00Z"'),
});
```

**Service call:** `postService.schedulePost(userId, post_id, scheduled_for)`

**Success output:** Full `PostFull` object with `status: "scheduled"` and `scheduled_for` set.

**Errors:** `POST_NOT_FOUND`, `FORBIDDEN`, `INVALID_DATE`, `INVALID_SCHEDULE_TIME`

---

## Tool 8 — `unpublish_post`

**File:** `packages/mcp/src/tools/unpublishPost.tool.ts`

**Description for agents:**
> Reverts a published or scheduled post back to draft status. The post will no longer be publicly visible. Cannot be called on a post that is already a draft.

**Input schema:**
```typescript
const unpublishPostSchema = z.object({
  post_id: z.number().int().positive().describe('The numeric ID of the post to unpublish'),
});
```

**Service call:** `postService.unpublishPost(userId, post_id)`

**Success output:** Full `PostFull` object with `status: "draft"`.

**Errors:** `POST_NOT_FOUND`, `FORBIDDEN`, `ALREADY_DRAFT`

---

## Tool 9 — `manage_seo`

**File:** `packages/mcp/src/tools/manageSeo.tool.ts`

**Description for agents:**
> Sets or updates the SEO metadata for a blog post. All fields are optional — only provided fields are updated; omitted fields are left unchanged. `seo_title` should be under 60 characters, `seo_description` under 160 characters. `canonical_url` must be a valid HTTPS URL if provided.

**Input schema:**
```typescript
const manageSeoSchema = z.object({
  post_id:         z.number().int().positive()
                     .describe('The numeric post ID'),
  seo_title:       z.string().max(60).optional()
                     .describe('SEO title, max 60 chars'),
  seo_description: z.string().max(160).optional()
                     .describe('Meta description, max 160 chars'),
  seo_keywords:    z.string().max(200).optional()
                     .describe('Comma-separated keywords, max 200 chars total'),
  canonical_url:   z.string().url().startsWith('https://').optional()
                     .describe('Canonical URL (must be https://)'),
}).refine(
  (d) => [d.seo_title, d.seo_description, d.seo_keywords, d.canonical_url].some(Boolean),
  { message: 'At least one SEO field must be provided' }
);
```

**Service call:** `postService.manageSeo(userId, post_id, { seo_title, seo_description, seo_keywords, canonical_url })`

**Success output:** Full `PostFull` object with updated SEO fields.

**Errors:** `POST_NOT_FOUND`, `FORBIDDEN`, `VALIDATION_ERROR`

---

## Tool 10 — `get_analytics`

**File:** `packages/mcp/src/tools/getAnalytics.tool.ts`

**Description for agents:**
> Returns analytics data for the authenticated user's blog. If `post_id` is provided, returns per-post analytics. Otherwise returns account-wide totals and a list of top-performing posts. The `range` parameter controls how far back to look: "7d", "30d", "90d", or "all".

**Input schema:**
```typescript
const getAnalyticsSchema = z.object({
  post_id: z.number().int().positive().optional()
             .describe('Specific post ID for per-post analytics. Omit for account-wide.'),
  range:   z.enum(['7d', '30d', '90d', 'all']).default('30d')
             .describe('Time range: 7d, 30d, 90d, or all time'),
});
```

**Service call:**
- If `post_id` provided: `analyticsService.getPostAnalytics(userId, post_id, range)`
- Otherwise: `analyticsService.getAccountAnalytics(userId, range)`

**Success output (per-post):**
```json
{
  "post_id": 42,
  "title": "My First Post",
  "slug": "my-first-post",
  "total_views": 1200,
  "unique_views": 890,
  "range": "30d"
}
```

**Success output (account-wide):**
```json
{
  "total_views": 5400,
  "unique_views": 3200,
  "range": "30d",
  "top_posts": [
    { "post_id": 42, "title": "My First Post", "slug": "...", "total_views": 1200, "unique_views": 890 }
  ]
}
```

**Errors:** `POST_NOT_FOUND`, `FORBIDDEN`

---

## Shared Schema File Location

All 10 tool schemas MUST be defined in:
```
packages/shared/src/schemas/mcpTools.schema.ts
```

They are imported by both:
- `packages/mcp/src/tools/*.tool.ts` (for tool registration)
- `packages/api/src/routes/*.route.ts` (Zod schemas converted to JSON Schema for Fastify validation)

This ensures validation rules are identical between the MCP and REST API paths.

---

## Validation Rules Summary

| Tool | Key Constraints |
|---|---|
| `create_post` | title 1–200, content non-empty, excerpt max 500 |
| `update_post` | post_id positive int, at least one field, same field limits |
| `delete_post` | post_id positive int |
| `list_posts` | status enum, page ≥ 1, limit 1–100 |
| `get_post` | post_id positive int |
| `publish_post` | post_id positive int |
| `schedule_post` | post_id positive int, scheduled_for valid ISO 8601 |
| `unpublish_post` | post_id positive int |
| `manage_seo` | post_id positive int, at least one field, seo_title ≤ 60, seo_description ≤ 160, canonical_url valid https:// |
| `get_analytics` | post_id positive int (optional), range enum |

---

## Authentication Requirements

No tool input schema contains `user_id`. The `userId` is provided by the `RequestContext` object from the MCP transport layer. Tool handlers MUST pass `context.userId` as the first argument to every service method.

---

## Error Handling

Each tool handler wraps its service call in try/catch:

```typescript
} catch (error) {
  const message = error instanceof AppError
    ? `[${error.code}] ${error.message}`
    : 'An unexpected error occurred';
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true
  };
}
```

The AI agent receives a human-readable error and the error code so it can adjust its next action (e.g., use a different post ID, correct a date format).

---

## Acceptance Criteria

- [ ] All 10 tools are registered and callable via the MCP SDK.
- [ ] No tool exposes `user_id` in its input schema.
- [ ] `create_post` returns a draft post with a generated slug.
- [ ] `publish_post` called twice on the same post returns `isError: true` with `ALREADY_PUBLISHED`.
- [ ] `schedule_post` with a past datetime returns `isError: true` with `INVALID_SCHEDULE_TIME`.
- [ ] `manage_seo` with no SEO fields returns `isError: true` with `VALIDATION_ERROR`.
- [ ] `get_analytics` without `post_id` returns account-wide totals.
- [ ] `get_analytics` with `post_id` belonging to another user returns `isError: true` with `FORBIDDEN`.
- [ ] Every tool's description string is accurate and present (visible to agents).
- [ ] Tool schemas in `@quill/shared` are identical to those used by the REST API for equivalent operations.

---

## Tests Required

| Test | Type | Description |
|---|---|---|
| `create_post` — valid | Unit | Service called, result returned |
| `create_post` — missing title | Unit | `isError: true`, VALIDATION_ERROR |
| `update_post` — no fields | Unit | `isError: true`, VALIDATION_ERROR |
| `update_post` — wrong owner | Unit | `isError: true`, FORBIDDEN |
| `delete_post` — not found | Unit | `isError: true`, POST_NOT_FOUND |
| `list_posts` — default params | Unit | Service called with page=1, limit=20 |
| `publish_post` — already published | Unit | `isError: true`, ALREADY_PUBLISHED |
| `schedule_post` — past date | Unit | `isError: true`, INVALID_SCHEDULE_TIME |
| `unpublish_post` — already draft | Unit | `isError: true`, ALREADY_DRAFT |
| `manage_seo` — no fields | Unit | `isError: true`, VALIDATION_ERROR |
| `manage_seo` — http canonical_url | Unit | `isError: true`, VALIDATION_ERROR |
| `get_analytics` — account wide | Unit | analyticsService.getAccountAnalytics called |
| `get_analytics` — per post | Unit | analyticsService.getPostAnalytics called |
| All tools — userId from context | Unit | Service never called with user_id from params |

All unit tests mock `ServiceContainer` — no real DB or MCP transport required.

---

## Dependencies

- Spec 01 — `AppError`
- Spec 05 — `ServiceContainer`, `IPostService`, `IAnalyticsService`
- Spec 06 — `RequestContext`, `CallToolResult`, tool registration
- `@quill/shared` — tool schemas from `mcpTools.schema.ts`

---

## Implementation Tasks

- [ ] T-07-1: Create `packages/shared/src/schemas/mcpTools.schema.ts` with all 10 Zod schemas
- [ ] T-07-2: Implement `createPost.tool.ts`
- [ ] T-07-3: Implement `updatePost.tool.ts`
- [ ] T-07-4: Implement `deletePost.tool.ts`
- [ ] T-07-5: Implement `listPosts.tool.ts`
- [ ] T-07-6: Implement `getPost.tool.ts`
- [ ] T-07-7: Implement `publishPost.tool.ts`
- [ ] T-07-8: Implement `schedulePost.tool.ts`
- [ ] T-07-9: Implement `unpublishPost.tool.ts`
- [ ] T-07-10: Implement `manageSeo.tool.ts`
- [ ] T-07-11: Implement `getAnalytics.tool.ts`
- [ ] T-07-12: Write unit tests for all 10 tools
- [ ] T-07-13: Verify no `user_id` parameter exists in any tool schema

---

## Owner
**Dev C**
