# Spec 06 — MCP Server

## Objective
Implement the MCP server (`packages/mcp`) that exposes the 10 blogging tools to AI coding agents. The server is a thin transport adapter — it authenticates the connection via API key, resolves the user, and delegates every tool call to the shared service layer. It contains zero business logic.

---

## Requirements

1. The MCP server MUST use the official `@modelcontextprotocol/sdk` package.
2. The MCP server MUST use HTTP + SSE transport.
3. Every connection MUST be authenticated via `Authorization: Bearer <api_key>` before any tool is callable.
4. Authentication MUST use `ApiKeyService.verifyKey` — the same service used by the REST API.
5. The resolved `userId` MUST be injected into each tool call's context. Tools MUST NOT receive `user_id` as a user-provided input parameter.
6. Tool handlers MUST be thin: parse input → call service method → format output. No business logic inside tool handlers.
7. Tool input schemas MUST be Zod schemas imported from `@quill/shared`.
8. The MCP server factory MUST accept a `ServiceContainer` (same shape as the API server) for testability and to enforce the single service layer principle.
9. The MCP server MUST run on a separate port (`PORT_MCP`, default `3002`) from the API server.
10. The MCP server MUST expose a `/health` endpoint on its own port.
11. Connection errors and tool execution errors MUST be caught and returned as structured MCP error responses, never crashing the server.

---

## Architecture

```
AI Agent (Cursor / Claude Code / Windsurf)
    │
    │  HTTP/SSE  Authorization: Bearer quill_<key>
    ▼
┌─────────────────────────────────────────────────┐
│  MCP Server  (packages/mcp)                     │
│                                                 │
│  transport.ts                                   │
│    └─ apiKeyMiddleware  ──► ApiKeyService        │
│         │                  .verifyKey()          │
│         │ userId injected into RequestContext    │
│         ▼                                       │
│  McpServer (SDK)                                │
│    └─ tool registry (10 tools)                  │
│         │                                       │
│         ▼                                       │
│  tool handler                                   │
│    └─ calls service method(userId, params)      │
│                                                 │
│  ServiceContainer (same instance as API)        │
│    └─ PostService, AnalyticsService, etc.       │
└─────────────────────────────────────────────────┘
```

---

## Server Factory

```typescript
// packages/mcp/src/server.ts
export function createMcpServer(services: ServiceContainer): McpServerInstance

type McpServerInstance = {
  start(port: number): Promise<void>;
  stop(): Promise<void>;
};
```

`createMcpServer` MUST:
1. Instantiate the MCP SDK `Server` with name `"quill-mcp"` and version from `package.json`.
2. Register all 10 tool handlers (see Spec 07).
3. Set up HTTP/SSE transport with the API key authentication middleware.
4. Register the `/health` route.

---

## Transport and Authentication

### File: `packages/mcp/src/transport.ts`

The MCP SDK's `SSEServerTransport` is wrapped with an authentication middleware:

```
HTTP POST /mcp/message  ─►  apiKeyMiddleware  ─►  SSEServerTransport
HTTP GET  /mcp/sse      ─►  apiKeyMiddleware  ─►  SSEServerTransport
```

### `apiKeyMiddleware` flow

```typescript
// packages/mcp/src/auth/apiKeyMiddleware.ts

async function apiKeyMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing API key' });
    return;
  }
  const rawKey = header.slice(7);
  try {
    const { userId } = await services.apiKeyService.verifyKey(rawKey);
    req.mcpUserId = userId;   // attached to request for tool handlers
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or revoked API key' });
  }
}
```

### RequestContext

Each tool invocation receives a `RequestContext` object:
```typescript
type RequestContext = {
  userId: number;
};
```

This is passed to every tool handler alongside the parsed tool arguments. The tool handler forwards `userId` to the service method. It is never part of the tool's public input schema.

---

## MCP Endpoint URLs

| Path | Method | Description |
|---|---|---|
| `/mcp/sse` | GET | SSE stream — agent connects here |
| `/mcp/message` | POST | Message endpoint — agent sends tool calls here |
| `/health` | GET | Liveness check |

### Personal MCP URL pattern
Each user constructs their connection URL using their API key prefix for documentation convenience:
```
Authorization: Bearer quill_<full_key>
SSE URL: http://host:3002/mcp/sse
```
The key prefix is NOT in the URL path — authentication is header-only.

---

## Tool Registration Pattern

All tools are registered in `packages/mcp/src/server.ts` via a single `registerTools(server, services)` call:

```typescript
function registerTools(server: McpServer, services: ServiceContainer): void {
  server.tool('create_post',    createPostSchema,    createPostHandler(services));
  server.tool('update_post',    updatePostSchema,    updatePostHandler(services));
  server.tool('delete_post',    deletePostSchema,    deletePostHandler(services));
  server.tool('list_posts',     listPostsSchema,     listPostsHandler(services));
  server.tool('get_post',       getPostSchema,       getPostHandler(services));
  server.tool('publish_post',   publishPostSchema,   publishPostHandler(services));
  server.tool('schedule_post',  schedulePostSchema,  schedulePostHandler(services));
  server.tool('unpublish_post', unpublishPostSchema, unpublishPostHandler(services));
  server.tool('manage_seo',     manageSeoSchema,     manageSeoHandler(services));
  server.tool('get_analytics',  getAnalyticsSchema,  getAnalyticsHandler(services));
}
```

Each handler is a curried function: `(services) => async (params, context) => McpToolResult`.

---

## Tool Result Format

All tool handlers MUST return an MCP `CallToolResult`:

**Success:**
```typescript
{
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
}
```

**Error:**
```typescript
{
  content: [{ type: 'text', text: `Error: ${error.message}` }],
  isError: true
}
```

Tool handlers MUST catch `AppError` and return it as an `isError: true` result rather than throwing (which would crash the SSE session).

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Missing `Authorization` header | 401 HTTP response before SSE connection established |
| Invalid / revoked API key | 401 HTTP response before SSE connection established |
| Tool call with invalid params | `isError: true` result with `VALIDATION_ERROR` message |
| Service throws `AppError` | `isError: true` result with error code + message |
| Unexpected exception in tool handler | `isError: true` result with `INTERNAL_ERROR`; error logged server-side |
| SSE connection dropped mid-session | Graceful cleanup; no server crash |

---

## Rate Limiting

- Rate limiting is applied at the HTTP layer wrapping the SSE transport.
- Limit: `RATE_LIMIT_MCP_RPM` (default 60) per API key per minute.
- Exceeding the limit returns HTTP 429 before the SSE session is established.

---

## `/health` Response

```json
{
  "status": "ok",
  "server": "mcp",
  "uptime": 123.4,
  "version": "1.0.0"
}
```

---

## Validation Rules

- Tool input parameters are validated by Zod schemas defined in `@quill/shared` (see Spec 07 for per-tool schemas).
- Validation errors are returned as `isError: true` MCP results, not HTTP errors, because the SSE session is already established by the time tool calls occur.
- `userId` is NEVER present in any tool's input schema.

---

## Authentication Requirements

- API key resolution happens at the transport/HTTP layer before the MCP session is established.
- Once a session is established, `userId` is embedded in the server-side session context for that connection.
- Tool handlers access `userId` from the context object, not from tool parameters.

---

## Acceptance Criteria

- [ ] `createMcpServer(services)` starts on `PORT_MCP` without error.
- [ ] Connecting to `/mcp/sse` without an `Authorization` header returns 401.
- [ ] Connecting with a revoked API key returns 401.
- [ ] A valid API key establishes an SSE session.
- [ ] Tool calls on an established session invoke the correct service method.
- [ ] Tool calls never accept or use a `user_id` parameter.
- [ ] A service-thrown `AppError` is returned as `isError: true`, not as a server crash.
- [ ] `GET /health` returns 200 on the MCP port.
- [ ] The MCP server and API server can run simultaneously on different ports.
- [ ] Rate limiting applies per API key.

---

## Tests Required

| Test | Type | Description |
|---|---|---|
| `createMcpServer` starts | Integration | Server listens on configured port |
| Auth — missing header | Integration | 401 before SSE |
| Auth — revoked key | Integration | 401 before SSE |
| Auth — valid key | Integration | SSE session established |
| Tool call — `userId` injected | Unit | Service called with correct `userId` |
| Tool call — bad params | Unit | `isError: true` returned |
| Tool call — `AppError` | Unit | `isError: true` with correct message |
| Tool call — unexpected error | Unit | `isError: true`, no crash |
| Rate limit | Integration | 429 after threshold |
| `GET /health` | Integration | 200 with correct shape |
| `registerTools` | Unit | All 10 tools registered |

---

## Dependencies

- Spec 01 — env utils, `AppError`
- Spec 03 — `ApiKeyService.verifyKey`
- Spec 05 — `ServiceContainer`, all service interfaces
- Spec 07 — tool handlers and schemas (developed in parallel)
- npm: `@modelcontextprotocol/sdk`

---

## Implementation Tasks

- [ ] T-06-1: Install `@modelcontextprotocol/sdk` in `packages/mcp`
- [ ] T-06-2: Implement `packages/mcp/src/auth/apiKeyMiddleware.ts`
- [ ] T-06-3: Implement `packages/mcp/src/transport.ts` with SSE transport + auth
- [ ] T-06-4: Implement `packages/mcp/src/server.ts` — `createMcpServer` factory
- [ ] T-06-5: Implement `registerTools` wiring all 10 tool handlers
- [ ] T-06-6: Implement `/health` route on MCP server
- [ ] T-06-7: Implement `packages/mcp/src/index.ts` entry point
- [ ] T-06-8: Apply rate limiting middleware
- [ ] T-06-9: Write integration tests for authentication and tool dispatch
- [ ] T-06-10: Write unit tests for error handling in tool execution

---

## Owner
**Dev C**
