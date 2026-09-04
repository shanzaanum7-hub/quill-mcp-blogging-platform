# Quill — MCP-Native Blogging Platform

Quill is a blogging platform where users manage their blog through natural-language requests to AI coding agents (Cursor, Claude Code, Windsurf). Each user receives a personal MCP server URL that connects directly to their blog.

## Architecture

```
AI Agent → MCP Server → Shared Services → SQLite DB
Dashboard → REST API  → Shared Services → SQLite DB
```

The MCP layer and the web dashboard call the **same shared service layer**. Business logic is never duplicated.

## Packages

| Package | Description |
|---|---|
| `@quill/shared` | Shared types, utilities, error classes, Zod schemas |
| `@quill/database` | SQLite client, migrations, repositories |
| `@quill/services` | All business logic (single source of truth) |
| `@quill/api` | Fastify REST API server |
| `@quill/mcp` | MCP server (SSE transport) |
| `@quill/web` | React dashboard SPA |
| `@quill/blog` | React public blog SPA |

## Prerequisites

- Node.js >= 20
- pnpm >= 9

## Getting Started

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env — fill in DATABASE_PATH and SESSION_SECRET

# 3. Build all packages
pnpm build

# 4. Start the API server
pnpm dev:api

# 5. Start the MCP server (separate terminal)
pnpm dev:mcp
```

## Available Scripts

| Script | Description |
|---|---|
| `pnpm build` | Compile all packages |
| `pnpm test` | Run all tests |
| `pnpm test:coverage` | Run tests with coverage report |
| `pnpm typecheck` | TypeScript type check all packages |
| `pnpm lint` | ESLint all source files |
| `pnpm dev:api` | Start API server in watch mode |
| `pnpm dev:mcp` | Start MCP server in watch mode |
| `pnpm dev:web` | Start dashboard Vite dev server |
| `pnpm dev:blog` | Start public blog Vite dev server |
| `pnpm migrate` | Run database migrations |

## Endpoints

| Endpoint | Description |
|---|---|
| `GET http://localhost:3001/health` | API server health check |
| `GET http://localhost:3002/health` | MCP server health check |
| `http://localhost:5173` | Web dashboard |
| `http://localhost:4173` | Public blog |

## Docker

```bash
# Copy and fill in your .env first
cp .env.example .env

# Start the full stack
docker compose up --build
```

## Environment Variables

See [`.env.example`](.env.example) for the full list with descriptions.

## Generating a SESSION_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Project Status

| Spec | Status |
|---|---|
| 01 — Project Foundation | ✅ Complete |
| 02 — Database Schema | 🔲 Pending |
| 03 — Authentication | 🔲 Pending |
| 04 — REST API Layer | 🔲 Pending |
| 05 — Shared Services | 🔲 Pending |
| 06 — MCP Server | 🔲 Pending |
| 07 — MCP Tools | 🔲 Pending |
| 08 — Web Dashboard | 🔲 Pending |
| 09 — Public Blog | 🔲 Pending |
| 10 — Analytics | 🔲 Pending |
| 11 — Security | 🔲 Pending |
| 12 — Testing | 🔲 Pending |
| 13 — Docker Deployment | 🔲 Pending |
