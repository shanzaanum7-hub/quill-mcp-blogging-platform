import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from './server.js';

const config = {
  NODE_ENV: 'test' as const,
  DATABASE_PATH: ':memory:',
  SESSION_SECRET: 'a'.repeat(64),
  PORT_API: 3001,
  PORT_MCP: 3002,
  RATE_LIMIT_API_RPM: 120,
  RATE_LIMIT_MCP_RPM: 60,
  CORS_ORIGINS: ['http://localhost:5173'],
  LOG_LEVEL: 'silent' as 'info',
};

type CreatedPostResponse = { data: { id: number; title: string; status: string } };
type PostListResponse = { data: { posts: unknown[] } };
type PublicPostsResponse = { data: { posts: unknown[] } };
type AnalyticsResponse = { data: { total_views: number; unique_views: number } };
type RegisterResponse = { data: Record<string, unknown> };

let apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
});

async function makeApp(): Promise<FastifyInstance> {
  const app = await createApp(config);
  apps.push(app);
  return app;
}

async function registerAndLogin(app: FastifyInstance, email: string, username: string): Promise<string> {
  await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, username, password: 'password123' } });
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'password123' } });
  const cookie = response.headers['set-cookie'];
  return Array.isArray(cookie) ? cookie[0] ?? '' : cookie ?? '';
}

describe('REST API', () => {
  it('requires a session for dashboard posts', async () => {
    const app = await makeApp();
    const response = await app.inject({ method: 'GET', url: '/api/posts' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('adds security headers and does not expose password hashes', async () => {
    const app = await makeApp();
    const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'secure@example.com', username: 'secure', password: 'password123' } });
    expect(response.statusCode).toBe(201);
    expect(response.json<RegisterResponse>().data).not.toHaveProperty('password_hash');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('uses secure session cookie flags and invalidates it on logout', async () => {
    const app = await makeApp();
    const cookie = await registerAndLogin(app, 'logout@example.com', 'logout');
    expect(cookie).toContain('quill_session=');
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie.toLowerCase()).toContain('samesite=lax');
    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(logout.statusCode).toBe(200);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it('creates and lists only the authenticated user posts', async () => {
    const app = await makeApp();
    const cookie = await registerAndLogin(app, 'alice@example.com', 'alice');
    const created = await app.inject({ method: 'POST', url: '/api/posts', headers: { cookie }, payload: { title: 'Hello API', content: 'Content' } });
    expect(created.statusCode).toBe(201);
    expect(created.json<CreatedPostResponse>().data).toMatchObject({ title: 'Hello API', status: 'draft' });
    const listed = await app.inject({ method: 'GET', url: '/api/posts', headers: { cookie } });
    expect(listed.statusCode).toBe(200);
    expect(listed.json<PostListResponse>().data.posts).toHaveLength(1);
  });

  it('prevents a different authenticated user from reading another post', async () => {
    const app = await makeApp();
    const aliceCookie = await registerAndLogin(app, 'alice@example.com', 'alice');
    const created = await app.inject({ method: 'POST', url: '/api/posts', headers: { cookie: aliceCookie }, payload: { title: 'Private', content: 'Secret' } });
    const bobCookie = await registerAndLogin(app, 'bob@example.com', 'bob');
    const response = await app.inject({ method: 'GET', url: `/api/posts/${created.json<CreatedPostResponse>().data.id}`, headers: { cookie: bobCookie } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('prevents cross-user update, delete, publish, and analytics access', async () => {
    const app = await makeApp();
    const aliceCookie = await registerAndLogin(app, 'owner@example.com', 'owner');
    const created = await app.inject({ method: 'POST', url: '/api/posts', headers: { cookie: aliceCookie }, payload: { title: 'Private', content: 'Secret' } });
    const postId = created.json<CreatedPostResponse>().data.id;
    const bobCookie = await registerAndLogin(app, 'intruder@example.com', 'intruder');
    for (const request of [
      { method: 'PUT' as const, url: `/api/posts/${postId}`, payload: { title: 'Stolen' } },
      { method: 'DELETE' as const, url: `/api/posts/${postId}` },
      { method: 'POST' as const, url: `/api/posts/${postId}/publish` },
      { method: 'POST' as const, url: `/api/posts/${postId}/unpublish` },
      { method: 'GET' as const, url: `/api/analytics/${postId}` },
    ]) {
      const response = await app.inject({ ...request, headers: { cookie: bobCookie } });
      expect(response.statusCode).toBe(403);
    }
  });

  it('rejects malformed resource IDs without leaking internal errors', async () => {
    const app = await makeApp();
    const cookie = await registerAndLogin(app, 'ids@example.com', 'ids');
    const response = await app.inject({ method: 'GET', url: '/api/posts/not-an-id', headers: { cookie } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(response.body).not.toContain('SqliteError');
  });

  it('exposes only published posts publicly', async () => {
    const app = await makeApp();
    const cookie = await registerAndLogin(app, 'alice@example.com', 'alice');
    const created = await app.inject({ method: 'POST', url: '/api/posts', headers: { cookie }, payload: { title: 'Public Post', content: 'Visible' } });
    const before = await app.inject({ method: 'GET', url: '/api/public/alice/posts' });
    expect(before.json<PublicPostsResponse>().data.posts).toHaveLength(0);
    await app.inject({ method: 'POST', url: `/api/posts/${created.json<CreatedPostResponse>().data.id}/publish`, headers: { cookie } });
    const after = await app.inject({ method: 'GET', url: '/api/public/alice/posts' });
    expect(after.statusCode).toBe(200);
    expect(after.json<PublicPostsResponse>().data.posts).toHaveLength(1);
  });

  it('records analytics for a successful public published post view', async () => {
    const app = await makeApp();
    const cookie = await registerAndLogin(app, 'views@example.com', 'views');
    const created = await app.inject({ method: 'POST', url: '/api/posts', headers: { cookie }, payload: { title: 'Viewed Post', content: 'Visible' } });
    const postId = created.json<CreatedPostResponse>().data.id;
    await app.inject({ method: 'POST', url: `/api/posts/${postId}/publish`, headers: { cookie } });

    const viewed = await app.inject({ method: 'GET', url: '/api/public/views/posts/viewed-post', headers: { referer: 'https://example.com', 'user-agent': 'vitest' } });
    expect(viewed.statusCode).toBe(200);
    const analytics = await app.inject({ method: 'GET', url: `/api/analytics/${postId}`, headers: { cookie } });
    expect(analytics.statusCode).toBe(200);
    expect(analytics.json<AnalyticsResponse>().data).toMatchObject({ total_views: 1, unique_views: 0 });
  });

  it('does not record analytics for draft or nonexistent public posts', async () => {
    const app = await makeApp();
    const cookie = await registerAndLogin(app, 'unpublished@example.com', 'unpublished');
    const created = await app.inject({ method: 'POST', url: '/api/posts', headers: { cookie }, payload: { title: 'Draft Post', content: 'Hidden' } });
    const postId = created.json<CreatedPostResponse>().data.id;

    const draft = await app.inject({ method: 'GET', url: '/api/public/unpublished/posts/draft-post' });
    expect(draft.statusCode).toBe(404);
    const nonexistent = await app.inject({ method: 'GET', url: '/api/public/unpublished/posts/missing-post' });
    expect(nonexistent.statusCode).toBe(404);
    const analytics = await app.inject({ method: 'GET', url: `/api/analytics/${postId}`, headers: { cookie } });
    expect(analytics.statusCode).toBe(200);
    expect(analytics.json<AnalyticsResponse>().data).toMatchObject({ total_views: 0, unique_views: 0 });
  });
});