# Spec 13 — Docker Deployment

## Objective
Define the complete containerisation and deployment configuration for Quill. All components MUST be runnable with a single `docker compose up` command in both development and production modes. The SQLite database file MUST be persisted via a Docker volume shared between the API and MCP containers.

---

## Requirements

1. All services MUST be containerised in Docker.
2. `docker compose up` MUST start the full stack: API server, MCP server, web dashboard, and public blog.
3. The SQLite database file MUST be stored on a named Docker volume, mounted into both the `api` and `mcp` containers at the same path.
4. The Dockerfile MUST use multi-stage builds to produce minimal production images.
5. Frontend assets (web dashboard, public blog) MUST be served by Nginx.
6. Both API and MCP containers MUST run the database migration runner on startup before accepting requests.
7. All secrets and configuration MUST come from environment variables (`.env` file in development).
8. The production compose file MUST NOT expose database ports or internal service ports to the host unnecessarily.
9. Health checks MUST be defined for every service.
10. The `api` container MUST be the only container that starts `packages/api`. The `mcp` container MUST be the only container that starts `packages/mcp`. They MUST NOT be combined.

---

## Container Inventory

| Container | Image Built From | Port (host:container) | Description |
|---|---|---|---|
| `api` | Dockerfile, target `api` | `3001:3001` | Fastify REST API |
| `mcp` | Dockerfile, target `mcp` | `3002:3002` | MCP SSE server |
| `web` | Dockerfile, target `web` | `5173:80` | Dashboard Nginx |
| `blog` | Dockerfile, target `blog` | `4173:80` | Public blog Nginx |

---

## Multi-Stage Dockerfile

```dockerfile
# ─────────────────────────────────────────────────────────
# Stage 1: base — shared Node.js base with pnpm
# ─────────────────────────────────────────────────────────
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# ─────────────────────────────────────────────────────────
# Stage 2: deps — install ALL workspace dependencies
# ─────────────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json     ./packages/shared/
COPY packages/database/package.json   ./packages/database/
COPY packages/services/package.json   ./packages/services/
COPY packages/api/package.json        ./packages/api/
COPY packages/mcp/package.json        ./packages/mcp/
COPY packages/web/package.json        ./packages/web/
COPY packages/blog/package.json       ./packages/blog/
RUN pnpm install --frozen-lockfile

# ─────────────────────────────────────────────────────────
# Stage 3: builder — compile all TypeScript + Vite builds
# ─────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .
RUN pnpm -r build

# ─────────────────────────────────────────────────────────
# Stage 4: api — production API server
# ─────────────────────────────────────────────────────────
FROM base AS api
ENV NODE_ENV=production
COPY --from=builder /app/packages/shared/dist   ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/database/dist  ./packages/database/dist
COPY --from=builder /app/packages/database/package.json ./packages/database/package.json
COPY --from=builder /app/packages/services/dist  ./packages/services/dist
COPY --from=builder /app/packages/services/package.json ./packages/services/package.json
COPY --from=builder /app/packages/api/dist       ./packages/api/dist
COPY --from=builder /app/packages/api/package.json ./packages/api/package.json
COPY --from=deps    /app/node_modules            ./node_modules
COPY --from=deps    /app/packages/database/node_modules ./packages/database/node_modules
COPY pnpm-workspace.yaml package.json ./
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "packages/api/dist/index.js"]

# ─────────────────────────────────────────────────────────
# Stage 5: mcp — production MCP server
# ─────────────────────────────────────────────────────────
FROM base AS mcp
ENV NODE_ENV=production
COPY --from=builder /app/packages/shared/dist   ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/database/dist  ./packages/database/dist
COPY --from=builder /app/packages/database/package.json ./packages/database/package.json
COPY --from=builder /app/packages/services/dist  ./packages/services/dist
COPY --from=builder /app/packages/services/package.json ./packages/services/package.json
COPY --from=builder /app/packages/mcp/dist       ./packages/mcp/dist
COPY --from=builder /app/packages/mcp/package.json ./packages/mcp/package.json
COPY --from=deps    /app/node_modules            ./node_modules
COPY pnpm-workspace.yaml package.json ./
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3002/health || exit 1
CMD ["node", "packages/mcp/dist/index.js"]

# ─────────────────────────────────────────────────────────
# Stage 6: web — dashboard Nginx
# ─────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS web
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html
COPY docker/nginx-web.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost:80/ || exit 1

# ─────────────────────────────────────────────────────────
# Stage 7: blog — public blog Nginx
# ─────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS blog
COPY --from=builder /app/packages/blog/dist /usr/share/nginx/html
COPY docker/nginx-blog.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost:80/ || exit 1
```

---

## Docker Compose — Development (`docker-compose.yml`)

```yaml
name: quill

volumes:
  quill_db:

services:
  api:
    build:
      context: .
      target: api
    ports:
      - "3001:3001"
    volumes:
      - quill_db:/data/db
    environment:
      NODE_ENV:             development
      DATABASE_PATH:        /data/db/quill.db
      SESSION_SECRET:       ${SESSION_SECRET}
      PORT_API:             3001
      CORS_ORIGINS:         http://localhost:5173,http://localhost:4173
      LOG_LEVEL:            debug
      RATE_LIMIT_API_RPM:   120
      RATE_LIMIT_MCP_RPM:   60
    healthcheck:
      test:     ["CMD", "wget", "-qO-", "http://localhost:3001/health"]
      interval: 30s
      timeout:  5s
      retries:  3
    restart: unless-stopped

  mcp:
    build:
      context: .
      target: mcp
    ports:
      - "3002:3002"
    volumes:
      - quill_db:/data/db     # same volume as api — shared SQLite file
    environment:
      NODE_ENV:             development
      DATABASE_PATH:        /data/db/quill.db
      SESSION_SECRET:       ${SESSION_SECRET}
      PORT_MCP:             3002
      LOG_LEVEL:            debug
      RATE_LIMIT_MCP_RPM:   60
    depends_on:
      api:
        condition: service_healthy   # ensures migrations run (via api) before mcp starts
    healthcheck:
      test:     ["CMD", "wget", "-qO-", "http://localhost:3002/health"]
      interval: 30s
      timeout:  5s
      retries:  3
    restart: unless-stopped

  web:
    build:
      context: .
      target: web
    ports:
      - "5173:80"
    depends_on:
      - api
    restart: unless-stopped

  blog:
    build:
      context: .
      target: blog
    ports:
      - "4173:80"
    depends_on:
      - api
    restart: unless-stopped
```

---

## Docker Compose — Production (`docker-compose.prod.yml`)

```yaml
name: quill-prod

volumes:
  quill_db:

services:
  api:
    image: quill-api:${VERSION:-latest}
    expose:
      - "3001"         # not published to host; accessed via reverse proxy
    volumes:
      - quill_db:/data/db
    environment:
      NODE_ENV:      production
      DATABASE_PATH: /data/db/quill.db
      SESSION_SECRET: ${SESSION_SECRET}
      PORT_API:      3001
      CORS_ORIGINS:  ${CORS_ORIGINS}
      LOG_LEVEL:     info
    restart: always

  mcp:
    image: quill-mcp:${VERSION:-latest}
    expose:
      - "3002"
    volumes:
      - quill_db:/data/db
    environment:
      NODE_ENV:      production
      DATABASE_PATH: /data/db/quill.db
      SESSION_SECRET: ${SESSION_SECRET}
      PORT_MCP:      3002
      LOG_LEVEL:     info
    depends_on:
      api:
        condition: service_healthy
    restart: always

  web:
    image: quill-web:${VERSION:-latest}
    expose:
      - "80"
    restart: always

  blog:
    image: quill-blog:${VERSION:-latest}
    expose:
      - "80"
    restart: always

  proxy:
    image: nginx:1.27-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/nginx-proxy.conf:/etc/nginx/conf.d/default.conf:ro
      - ./docker/certs:/etc/nginx/certs:ro    # TLS certificates
    depends_on:
      - api
      - mcp
      - web
      - blog
    restart: always
```

---

## Nginx Configurations

### `docker/nginx-web.conf` — Dashboard SPA

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # All routes fall through to index.html for React Router
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|svg|ico|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
}
```

### `docker/nginx-blog.conf` — Public Blog SPA

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|svg|ico|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
}
```

### `docker/nginx-proxy.conf` — Production Reverse Proxy

```nginx
upstream api  { server api:3001; }
upstream mcp  { server mcp:3002; }
upstream web  { server web:80; }
upstream blog { server blog:80; }

server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name quill.example.com;

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    # REST API
    location /api/ {
        proxy_pass         http://api;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # Health endpoint (both api and mcp)
    location /health {
        proxy_pass http://api;
    }

    # MCP server — SSE requires specific proxy settings
    location /mcp/ {
        proxy_pass             http://mcp;
        proxy_set_header       Host $host;
        proxy_set_header       X-Real-IP $remote_addr;
        proxy_set_header       X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version     1.1;
        proxy_set_header       Connection '';     # keep-alive for SSE
        proxy_read_timeout     3600s;             # long timeout for SSE streams
        proxy_buffering        off;               # required for SSE
        proxy_cache            off;
        chunked_transfer_encoding on;
    }

    # Dashboard SPA
    location /dashboard {
        proxy_pass http://web;
    }

    # Public blog
    location /blog {
        proxy_pass http://blog;
    }

    # Root → blog
    location / {
        proxy_pass http://blog;
    }
}
```

---

## Migration Startup Behaviour

The API container's entry point (`packages/api/dist/index.js`) MUST run migrations before starting the Fastify server:

```typescript
// packages/api/src/index.ts
async function main() {
  const env = loadEnv();
  const db  = createDatabaseClient(env.DATABASE_PATH);
  runMigrations(db);               // ← synchronous, runs before server starts
  const services = createServiceContainer(db);
  const app = await createApp(services);
  await app.listen({ port: env.PORT_API, host: '0.0.0.0' });
}
```

The MCP container depends on `api: service_healthy` in compose, ensuring migrations have completed before MCP starts. The MCP entry point also calls `runMigrations(db)` — the runner is idempotent so this is safe.

---

## Volume Strategy

```
Named volume: quill_db
  Mounted at: /data/db (in both api and mcp containers)
  Contains:   quill.db (SQLite file)

Why shared volume:
  - Both api and mcp need read/write access to the same database
  - SQLite WAL mode handles concurrent reads safely
  - Writes are serialised by SQLite's locking mechanism
  - Sufficient for MVP traffic; upgrade path is to PostgreSQL with connection pooling
```

**Backup strategy (documented, not automated in MVP):**
- Volume can be backed up with `docker run --rm -v quill_db:/data -v $(pwd):/backup alpine tar czf /backup/quill-db-backup.tar.gz /data`

---

## Environment Variable Injection

In development: variables come from `.env` file (loaded by Docker Compose automatically).
In production: variables MUST be injected via Docker secrets or the deployment platform's secrets manager (e.g., AWS Secrets Manager, Kubernetes Secrets). Never commit a production `.env` file.

---

## `.dockerignore`

```
node_modules
dist
.env
*.db
*.db-journal
.git
coverage
tests/e2e/screenshots
```

---

## Acceptance Criteria

- [ ] `docker compose up --build` starts all four containers without errors.
- [ ] `GET http://localhost:3001/health` returns 200 `{ status: "ok" }`.
- [ ] `GET http://localhost:3002/health` returns 200 `{ status: "ok" }`.
- [ ] `http://localhost:5173` serves the web dashboard login page.
- [ ] `http://localhost:4173/blog` serves the public blog.
- [ ] Data written via the API is visible via the MCP server (same SQLite volume).
- [ ] Stopping and restarting containers preserves all data (volume persists).
- [ ] `docker compose down` (without `-v`) does NOT delete the database volume.
- [ ] The MCP container does not start until the API container is healthy.
- [ ] All containers restart automatically on failure (`restart: unless-stopped`).
- [ ] No secrets are baked into Docker images (verified by inspecting image env).

---

## Tests Required

| Test | Type | Description |
|---|---|---|
| All containers start | Manual / CI | `docker compose up` exits 0, all healthy |
| API health check | Automated | `GET /health` → 200 after `compose up` |
| MCP health check | Automated | `GET /health` → 200 after `compose up` |
| Volume persistence | Manual | Stop + start, data survives |
| Shared volume | Automated | Write via API, read via MCP SDK client |
| Migration idempotency in container | Automated | Second `compose up` doesn't fail migration |
| Production image size | Manual | API/MCP images under 300 MB |

---

## Dependencies

- Spec 01 — All packages must build cleanly before Docker stages succeed
- Spec 02 — Migration runner called in container startup
- Spec 04 — `/health` endpoint
- Spec 06 — MCP `/health` endpoint

---

## Implementation Tasks

- [ ] T-13-1: Write multi-stage `Dockerfile` with all 7 stages
- [ ] T-13-2: Write `docker-compose.yml` (development)
- [ ] T-13-3: Write `docker-compose.prod.yml` (production)
- [ ] T-13-4: Write `docker/nginx-web.conf`
- [ ] T-13-5: Write `docker/nginx-blog.conf`
- [ ] T-13-6: Write `docker/nginx-proxy.conf` with SSE-compatible MCP proxy settings
- [ ] T-13-7: Write `.dockerignore`
- [ ] T-13-8: Verify `docker compose up --build` starts all services cleanly
- [ ] T-13-9: Verify data persists after `docker compose restart`
- [ ] T-13-10: Verify MCP container waits for API health before starting
- [ ] T-13-11: Document backup procedure in `README.md`

---

## Owner
**Dev C** (primary — infrastructure), reviewed by all devs before merge.
