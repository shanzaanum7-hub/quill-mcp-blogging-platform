# Quill — MCP-Native Blogging Platform

Quill is an MCP-native blogging platform that allows users to manage their blogs through AI coding agents such as Cursor, Claude Code, and Windsurf. Each user can use an authenticated MCP server to manage their own blog content, while the web dashboard and public blog provide a visual interface.

## Architecture

```text
AI Agent → MCP Server → Shared Services → SQLite Database
Dashboard → REST API → Shared Services → SQLite Database
Public Blog → REST API → Shared Services → SQLite Database
```

The MCP server, REST API, web dashboard, and public blog use the same shared service layer. Business logic is centralized and is not duplicated across interfaces.

## Monorepo Packages

| Package           | Description                                             |
| ----------------- | ------------------------------------------------------- |
| `@quill/shared`   | Shared types, utilities, error classes, and Zod schemas |
| `@quill/database` | SQLite client, migrations, and repositories             |
| `@quill/services` | Shared business logic and application services          |
| `@quill/api`      | Fastify REST API server                                 |
| `@quill/mcp`      | MCP server with authentication and blogging tools       |
| `@quill/web`      | React web dashboard                                     |
| `@quill/blog`     | React public blog application                           |

## Current Features

### Authentication

The REST API provides:

* User registration
* User login
* User logout
* Session-based authentication
* Current-user information
* API key management
* API key revocation

Protected endpoints require an authenticated session.

### MCP Authentication and Security

The MCP server uses API-key authentication.

Security principles include:

* MCP requests require a valid API key.
* Revoked or invalid API keys are rejected.
* The authenticated API key determines the current user.
* MCP tools do not accept a client-supplied raw `user_id`.
* Users can only access their own posts and analytics.
* Input validation is performed using the project's shared schemas.
* API and MCP endpoints include rate limiting and security protections where configured.

## MCP Server

The MCP server supports HTTP/Streamable HTTP transport and exposes authenticated blogging tools for AI coding agents.

### Implemented MCP Tools

The following MCP tools are currently implemented:

#### `create_post`

Creates a new blog post for the authenticated user.

The authenticated user is determined from the API key rather than from a user-supplied `user_id`.

#### `list_posts`

Lists blog posts belonging to the authenticated user.

Users cannot use this tool to retrieve another user's posts.

#### `publish_post`

Publishes a post owned by the authenticated user.

Publishing validates the post state and ownership before changing its status.

#### `get_analytics`

Retrieves analytics for the authenticated user's blog or a specific post, according to the supported tool input.

Analytics data includes view information such as total and unique views where applicable.

## REST API

The API server runs on port `3001` by default.

### Health

| Method | Endpoint  | Description      |
| ------ | --------- | ---------------- |
| GET    | `/health` | API health check |

### Authentication

| Method | Endpoint             | Description                        |
| ------ | -------------------- | ---------------------------------- |
| POST   | `/api/auth/register` | Register a user                    |
| POST   | `/api/auth/login`    | Log in                             |
| POST   | `/api/auth/logout`   | Log out                            |
| GET    | `/api/auth/me`       | Get the current authenticated user |

### API Keys

| Method | Endpoint        | Description              |
| ------ | --------------- | ------------------------ |
| GET    | `/api/keys`     | List API keys            |
| POST   | `/api/keys`     | Create an API key        |
| DELETE | `/api/keys/:id` | Revoke/delete an API key |

### Posts

| Method | Endpoint                   | Description                     |
| ------ | -------------------------- | ------------------------------- |
| GET    | `/api/posts`               | List authenticated user's posts |
| POST   | `/api/posts`               | Create a post                   |
| GET    | `/api/posts/:id`           | Get a post                      |
| PUT    | `/api/posts/:id`           | Update a post                   |
| DELETE | `/api/posts/:id`           | Delete a post                   |
| POST   | `/api/posts/:id/publish`   | Publish a post                  |
| POST   | `/api/posts/:id/unpublish` | Unpublish a post                |
| POST   | `/api/posts/:id/schedule`  | Schedule a post                 |
| PUT    | `/api/posts/:id/seo`       | Update post SEO information     |

### Analytics

| Method | Endpoint                 | Description                       |
| ------ | ------------------------ | --------------------------------- |
| GET    | `/api/analytics`         | Get account-level analytics       |
| GET    | `/api/analytics/:postId` | Get analytics for a specific post |

### Public Blog

Public blog endpoints do not require an authenticated session.

| Method | Endpoint                            | Description                           |
| ------ | ----------------------------------- | ------------------------------------- |
| GET    | `/api/public/:username/posts`       | Get published posts for a public blog |
| GET    | `/api/public/:username/posts/:slug` | Get a published post by slug          |

Public post views can generate analytics events.

## Analytics

Quill records analytics events for successful public views of published posts.

Analytics support:

* Total views
* Unique views
* Account-level analytics
* Post-level analytics
* Public post view event recording

Analytics access for authenticated users is protected by ownership checks.

## Web Applications

### Web Dashboard

The React dashboard is the visual interface for managing blog content and account features.

The dashboard is currently under active frontend development.

### Public Blog

The public blog application provides the public-facing blogging experience and consumes the public REST API endpoints.

The public blog UI is currently under active frontend development.

> The README intentionally does not mark the dashboard or public blog UI as complete until the frontend implementation is finished and integrated.

## Prerequisites

* Node.js >= 20
* pnpm >= 9

## Getting Started

```bash
# Install dependencies
pnpm install

# Configure environment
cp .env.example .env

# Edit .env and configure the required environment variables

# Build all packages
pnpm build

# Start the API server
pnpm dev:api

# Start the MCP server in a separate terminal
pnpm dev:mcp
```

For frontend development:

```bash
pnpm dev:web
pnpm dev:blog
```

## Available Scripts

| Script               | Description                        |
| -------------------- | ---------------------------------- |
| `pnpm build`         | Build all packages                 |
| `pnpm test`          | Run the complete test suite        |
| `pnpm test:coverage` | Run tests with coverage            |
| `pnpm typecheck`     | Type-check all packages            |
| `pnpm lint`          | Run ESLint                         |
| `pnpm dev:api`       | Start the API server in watch mode |
| `pnpm dev:mcp`       | Start the MCP server in watch mode |
| `pnpm dev:web`       | Start the web dashboard            |
| `pnpm dev:blog`      | Start the public blog              |
| `pnpm migrate`       | Run database migrations            |

## Local Endpoints

| Service       | URL                     |
| ------------- | ----------------------- |
| API           | `http://localhost:3001` |
| MCP           | `http://localhost:3002` |
| Web Dashboard | `http://localhost:5173` |
| Public Blog   | `http://localhost:4173` |

## Docker

```bash
# Configure the environment first
cp .env.example .env

# Start the full stack
docker compose up --build
```

## Environment Variables

See [`.env.example`](.env.example) for the complete list of environment variables and descriptions.

### Generating a SESSION_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Testing

The project includes unit and integration tests across the monorepo.

MCP testing currently covers:

* API key middleware
* Valid and invalid authentication
* Revoked API keys
* MCP tool behavior
* Post creation
* Post listing
* Publishing
* Analytics
* Multi-user ownership isolation
* MCP HTTP transport
* Request validation and error handling
* Health and endpoint behavior

Current validation:

```text
pnpm test      → 133/133 tests passed
pnpm typecheck → passed
pnpm build     → passed
pnpm lint      → passed
```

## Project Status

| Area               | Status      |
| ------------------ | ----------- |
| Project Foundation | Complete    |
| Database Schema    | Complete    |
| Authentication     | Complete    |
| REST API Layer     | Complete    |
| Shared Services    | Complete    |
| MCP Server         | Complete    |
| MCP Tools          | Complete    |
| Web Dashboard      | In progress |
| Public Blog        | In progress |
| Analytics          | Complete    |
| Security           | Complete    |
| Testing            | Complete    |
| Docker Deployment  | Complete    |

## Development Notes

* Business logic belongs in `@quill/services`.
* Database access belongs in `@quill/database`.
* REST API routes belong in `@quill/api`.
* MCP authentication must determine the user from the authenticated API key.
* MCP tools must not trust a client-provided `user_id`.
* User-owned resources must always be protected by ownership checks.
* New frontend functionality should consume existing API/service contracts rather than duplicating backend business logic.
