# Spec 01 — Project Foundation

## Objective
Establish the complete monorepo scaffold, toolchain configuration, shared TypeScript base, environment variable contract, and inter-package dependency wiring so every developer can begin work in their assigned package without further setup.

---

## Requirements

1. The repository MUST be a pnpm workspace monorepo.
2. All packages MUST share a single `tsconfig.base.json` from the root.
3. TypeScript strict mode MUST be enabled across all packages.
4. Each package MUST have its own `package.json`, `tsconfig.json` (extending base), and `src/index.ts` barrel export.
5. The packages MUST be:
   - `packages/shared`
   - `packages/database`
   - `packages/services`
   - `packages/api`
   - `packages/mcp`
   - `packages/web`
   - `packages/blog`
6. Root `package.json` MUST contain workspace scripts: `build`, `test`, `lint`, `typecheck`, `dev:api`, `dev:mcp`, `dev:web`, `dev:blog`.
7. An `.env.example` MUST define every required environment variable with placeholder values and comments.
8. An `.env` file (git-ignored) MUST be required at runtime; missing required variables MUST cause the process to exit with a descriptive error.
9. ESLint and Prettier MUST be configured at the root and apply to all packages.
10. Vitest MUST be configured at the root as the single test runner for all server-side packages.

---

## Folder Structure (canonical, must match exactly)

```
quill-mcp-blogging-platform/
├── .env.example
├── .env                          # git-ignored
├── .eslintrc.json
├── .prettierrc
├── .gitignore
├── package.json                  # workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.config.ts              # root vitest config
├── docker-compose.yml
├── docker-compose.prod.yml
├── Dockerfile
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── schemas/
│   │       ├── types/
│   │       ├── errors/
│   │       ├── utils/
│   │       └── index.ts
│   ├── database/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── client.ts
│   │       ├── migrations/
│   │       ├── repositories/
│   │       └── index.ts
│   ├── services/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts
│   ├── mcp/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts
│   ├── web/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   └── src/
│   │       └── main.tsx
│   └── blog/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           └── main.tsx
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

---

## Environment Variable Contract

All variables MUST be present unless marked optional.

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | Yes | — | `development` \| `production` \| `test` |
| `DATABASE_PATH` | Yes | — | Absolute path to SQLite `.db` file |
| `SESSION_SECRET` | Yes | — | Min 64 chars, used to sign session cookies |
| `PORT_API` | No | `3001` | Fastify API server port |
| `PORT_MCP` | No | `3002` | MCP server port |
| `RATE_LIMIT_API_RPM` | No | `120` | API requests per minute per key |
| `RATE_LIMIT_MCP_RPM` | No | `60` | MCP requests per minute per key |
| `CORS_ORIGINS` | No | `http://localhost:5173` | Comma-separated allowed origins |
| `LOG_LEVEL` | No | `info` | `trace` \| `debug` \| `info` \| `warn` \| `error` |

### Environment loader behaviour
- A utility `packages/shared/src/utils/env.ts` MUST export a `loadEnv()` function.
- `loadEnv()` reads `process.env`, validates required keys, and returns a typed config object.
- If any required variable is missing, it MUST throw a descriptive error listing all missing keys before the server boots.
- `loadEnv()` MUST be called at the top of each server entry point (`packages/api/src/index.ts`, `packages/mcp/src/index.ts`).

---

## Package Dependency Graph

```
shared        →  (no internal deps)
database      →  shared
services      →  database, shared
api           →  services, shared
mcp           →  services, shared
web           →  (no server packages; calls api over HTTP)
blog          →  (no server packages; calls api over HTTP)
```

Each `package.json` MUST declare these as `"dependencies"` using the workspace protocol:

```json
"@quill/shared": "workspace:*"
```

Package name convention: `@quill/<package-name>`.

---

## Root Scripts Contract

| Script | Command | Description |
|---|---|---|
| `build` | `pnpm -r build` | Compile all packages |
| `test` | `vitest run` | Run all tests once |
| `test:watch` | `vitest` | Watch mode |
| `test:e2e` | `playwright test` | E2E suite |
| `lint` | `eslint packages --ext .ts,.tsx` | Lint all source |
| `typecheck` | `pnpm -r typecheck` | tsc --noEmit across packages |
| `dev:api` | `pnpm --filter @quill/api dev` | Start API in dev mode |
| `dev:mcp` | `pnpm --filter @quill/mcp dev` | Start MCP in dev mode |
| `dev:web` | `pnpm --filter @quill/web dev` | Start dashboard Vite |
| `dev:blog` | `pnpm --filter @quill/blog dev` | Start blog Vite |
| `migrate` | `pnpm --filter @quill/database migrate` | Run DB migrations |

---

## TypeScript Base Configuration

`tsconfig.base.json` MUST include:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

---

## Shared Package (`packages/shared`) — Initial Contents

### `src/errors/AppError.ts`
Exports a typed `AppError` class extending `Error` with:
- `code: string` — machine-readable error code (e.g. `POST_NOT_FOUND`)
- `statusCode: number` — HTTP status code equivalent
- `details?: unknown` — optional structured detail

### `src/utils/slug.ts`
- `generateSlug(title: string): string` — lowercase, strip special chars, replace spaces with hyphens, max 80 chars
- `ensureUniqueSlug(base: string, existingSlugs: string[]): string` — appends `-2`, `-3` etc. if collision

### `src/utils/date.ts`
- `toISOString(date: Date): string`
- `parseISOString(s: string): Date` — throws `AppError` with code `INVALID_DATE` if invalid
- `isFuture(date: Date): boolean`

### `src/utils/env.ts`
- `loadEnv(): EnvConfig` — as described above

---

## Validation Rules

- All `package.json` files MUST specify `"type": "module"`.
- The root `.gitignore` MUST exclude: `node_modules/`, `dist/`, `.env`, `*.db`, `*.db-journal`, `coverage/`, `.playwright/`.
- No circular dependencies between packages (enforced by the one-directional graph above).

---

## Acceptance Criteria

- [ ] `pnpm install` completes without errors from repo root.
- [ ] `pnpm build` compiles all packages without TypeScript errors.
- [ ] `pnpm typecheck` passes with zero errors.
- [ ] `pnpm lint` passes with zero errors.
- [ ] Starting `packages/api` or `packages/mcp` with a missing required env variable prints a clear error and exits with code 1.
- [ ] Each package's `dist/index.js` and `dist/index.d.ts` are produced after build.
- [ ] `packages/shared` has zero runtime dependencies outside Node.js built-ins.

---

## Tests Required

| Test | Type | Description |
|---|---|---|
| `env.loadEnv` missing keys | Unit | Throws with all missing key names listed |
| `env.loadEnv` all keys present | Unit | Returns typed config without throwing |
| `generateSlug` normal title | Unit | Produces correct slug |
| `generateSlug` special chars | Unit | Strips non-alphanumeric correctly |
| `ensureUniqueSlug` collision | Unit | Appends suffix correctly |
| `parseISOString` valid string | Unit | Returns Date |
| `parseISOString` invalid string | Unit | Throws `AppError(INVALID_DATE)` |
| `AppError` construction | Unit | code, statusCode, message set correctly |

---

## Dependencies

- None. This is the root of all dependencies; it must be completed first.

---

## Implementation Tasks

- [ ] T-01-1: Initialise pnpm workspace, create `pnpm-workspace.yaml`
- [ ] T-01-2: Create root `package.json` with all workspace scripts
- [ ] T-01-3: Create `tsconfig.base.json`
- [ ] T-01-4: Configure ESLint + Prettier at root
- [ ] T-01-5: Configure root `vitest.config.ts`
- [ ] T-01-6: Scaffold all 7 package directories with `package.json` and `tsconfig.json`
- [ ] T-01-7: Implement `packages/shared/src/errors/AppError.ts`
- [ ] T-01-8: Implement `packages/shared/src/utils/slug.ts`
- [ ] T-01-9: Implement `packages/shared/src/utils/date.ts`
- [ ] T-01-10: Implement `packages/shared/src/utils/env.ts`
- [ ] T-01-11: Write `.env.example` with all variables documented
- [ ] T-01-12: Write unit tests for all shared utilities
- [ ] T-01-13: Verify `pnpm build` and `pnpm typecheck` pass clean

---

## Owner
**Dev A**
