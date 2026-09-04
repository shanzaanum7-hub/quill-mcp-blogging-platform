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
COPY --from=builder /app/packages/shared/dist       ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/database/dist     ./packages/database/dist
COPY --from=builder /app/packages/database/package.json ./packages/database/package.json
COPY --from=builder /app/packages/services/dist     ./packages/services/dist
COPY --from=builder /app/packages/services/package.json ./packages/services/package.json
COPY --from=builder /app/packages/api/dist          ./packages/api/dist
COPY --from=builder /app/packages/api/package.json  ./packages/api/package.json
COPY --from=deps    /app/node_modules               ./node_modules
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
COPY --from=builder /app/packages/shared/dist       ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/database/dist     ./packages/database/dist
COPY --from=builder /app/packages/database/package.json ./packages/database/package.json
COPY --from=builder /app/packages/services/dist     ./packages/services/dist
COPY --from=builder /app/packages/services/package.json ./packages/services/package.json
COPY --from=builder /app/packages/mcp/dist          ./packages/mcp/dist
COPY --from=builder /app/packages/mcp/package.json  ./packages/mcp/package.json
COPY --from=deps    /app/node_modules               ./node_modules
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
