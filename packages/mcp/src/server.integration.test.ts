/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
import net from 'node:net';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AnalyticsRepository, ApiKeyRepository, PostRepository, runMigrations, UserRepository } from '@quill/database';
import { ApiKeyService, createServiceContainer, type ServiceContainer } from '@quill/services';
import type { EnvConfig } from '@quill/shared';
import { createMcpServer, type McpServerInstance } from './server.js';

const testConfig: EnvConfig = {
  NODE_ENV: 'test',
  DATABASE_PATH: ':memory:',
  SESSION_SECRET: 'a'.repeat(64),
  PORT_API: 3001,
  PORT_MCP: 3002,
  RATE_LIMIT_API_RPM: 120,
  RATE_LIMIT_MCP_RPM: 60,
  CORS_ORIGINS: ['http://localhost:5173'],
  LOG_LEVEL: 'info',
};

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      if (typeof address === 'object' && address !== null) {
        const port = address.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('Failed to get free port')));
      }
    });
    srv.on('error', reject);
  });
}

describe('MCP Server Integration Tests', () => {
  let db: Database.Database;
  let services: ServiceContainer;
  let serverInstance: McpServerInstance;
  let serverPort: number;
  let baseUrl: string;

  let userAId: number;
  let userARawKey: string;
  let userBId: number;
  let userBRawKey: string;

  let revokedKeyId: number;
  let revokedRawKey: string;

  beforeAll(async () => {
    db = new Database(':memory:');
    runMigrations(db);
    services = createServiceContainer(db);

    const userRepo = new UserRepository(db);
    const userA = userRepo.create({ username: 'alice', email: 'alice@example.com', password_hash: 'hashA' });
    userAId = userA.id;

    const userB = userRepo.create({ username: 'bob', email: 'bob@example.com', password_hash: 'hashB' });
    userBId = userB.id;

    const apiKeyRepo = new ApiKeyRepository(db);
    const keyService = new ApiKeyService(apiKeyRepo);

    const keyA = keyService.createKey(userAId, 'Alice MCP Key');
    userARawKey = keyA.raw_key;

    const keyB = keyService.createKey(userBId, 'Bob MCP Key');
    userBRawKey = keyB.raw_key;

    const revokedKey = keyService.createKey(userAId, 'Revoked Key');
    revokedRawKey = revokedKey.raw_key;
    revokedKeyId = revokedKey.id;
    keyService.revokeKey(userAId, revokedKeyId);

    serverPort = await getFreePort();
    baseUrl = `http://127.0.0.1:${serverPort}`;
    serverInstance = createMcpServer(testConfig, services);
    await serverInstance.start(serverPort);
  });

  afterAll(async () => {
    await serverInstance.stop();
    db.close();
  });

  // Helper for JSON-RPC MCP requests over HTTP transport
  async function callMcpHttp(
    apiKey: string | null,
    body: unknown,
    customHeaders: Record<string, string> = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...customHeaders,
    };

    if (apiKey !== null) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    return fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  // ── 1. Health endpoint ───────────────────────────────────────────────────

  describe('1. Health endpoint', () => {
    it('returns HTTP 200 with server status and uptime', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');

      const data = await res.json();
      expect(data).toMatchObject({
        status: 'ok',
        server: 'mcp',
        version: '1.0.0',
      });
      expect(typeof data.uptime).toBe('number');
      expect(data.uptime).toBeGreaterThanOrEqual(0);
    });

    it('returns 404 for unknown endpoints', async () => {
      const res = await fetch(`${baseUrl}/api/unknown`);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data).toEqual({ error: 'Not found' });
    });
  });

  // ── 2. Authentication ────────────────────────────────────────────────────

  describe('2. Authentication', () => {
    it('rejects requests missing the Authorization header with 401', async () => {
      const res = await callMcpHttp(null, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Authorization');
    });

    it('rejects requests with malformed Authorization header with 401', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic invalid_credentials',
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Authorization');
    });

    it('rejects requests with an invalid API key with 401', async () => {
      const res = await callMcpHttp('quill_invalidkey123456789012345678901234567890', {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('API key');
    });

    it('rejects requests with a revoked API key with 401', async () => {
      const res = await callMcpHttp(revokedRawKey, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('API key');
    });

    it('rejects requests with malformed JSON body with 400', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userARawKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: '{"invalid_json": true,',
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Invalid JSON');
    });

    it('rejects requests missing required Accept header with 406', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userARawKey}`,
          'Content-Type': 'application/json',
          Accept: 'text/html',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });

      expect(res.status).toBe(406);
    });

    it('rejects requests missing application/json Content-Type with 415', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userARawKey}`,
          'Content-Type': 'text/plain',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });

      expect(res.status).toBe(415);
    });
  });

  // ── 3. MCP HTTP Transport & Tools Discovery ──────────────────────────────

  describe('3. MCP HTTP Transport & Tool Discovery', () => {
    it('lists registered MCP tools for an authenticated client', async () => {
      const res = await callMcpHttp(userARawKey, {
        jsonrpc: '2.0',
        id: 'list-1',
        method: 'tools/list',
        params: {},
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBe('list-1');
      expect(body.result).toBeDefined();

      const tools = body.result.tools as Array<{ name: string; description: string; inputSchema: unknown }>;
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('create_post');
      expect(toolNames).toContain('list_posts');
      expect(toolNames).toContain('publish_post');
      expect(toolNames).toContain('get_analytics');
    });
  });

  // ── 4. create_post Tool ──────────────────────────────────────────────────

  describe('4. create_post via HTTP transport', () => {
    it('creates a draft post belonging to the authenticated user', async () => {
      const res = await callMcpHttp(userARawKey, {
        jsonrpc: '2.0',
        id: 'create-1',
        method: 'tools/call',
        params: {
          name: 'create_post',
          arguments: {
            title: 'Alice First Post',
            content: '# Heading\n\nDraft content here.',
            excerpt: 'First post excerpt',
          },
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.result.isError).toBeFalsy();

      const post = JSON.parse(body.result.content[0].text);
      expect(post).toMatchObject({
        title: 'Alice First Post',
        slug: 'alice-first-post',
        content: '# Heading\n\nDraft content here.',
        excerpt: 'First post excerpt',
        status: 'draft',
      });
      expect(typeof post.id).toBe('number');
    });

    it('fails when required fields are missing', async () => {
      const res = await callMcpHttp(userARawKey, {
        jsonrpc: '2.0',
        id: 'create-bad-1',
        method: 'tools/call',
        params: {
          name: 'create_post',
          arguments: {
            // Missing content
            title: 'Only Title',
          },
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      // SDK returns JSON-RPC error for invalid inputSchema arguments
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(-32602);
    });

    it('fails when title exceeds maximum length', async () => {
      const res = await callMcpHttp(userARawKey, {
        jsonrpc: '2.0',
        id: 'create-bad-2',
        method: 'tools/call',
        params: {
          name: 'create_post',
          arguments: {
            title: 'A'.repeat(201),
            content: 'Content',
          },
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(-32602);
    });
  });

  // ── 5. list_posts Tool ───────────────────────────────────────────────────

  describe('5. list_posts via HTTP transport', () => {
    it('lists posts belonging to the authenticated user', async () => {
      const res = await callMcpHttp(userARawKey, {
        jsonrpc: '2.0',
        id: 'list-posts-1',
        method: 'tools/call',
        params: {
          name: 'list_posts',
          arguments: {
            page: 1,
            limit: 10,
          },
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.result.isError).toBeFalsy();

      const result = JSON.parse(body.result.content[0].text);
      expect(result.posts).toBeInstanceOf(Array);
      expect(result.posts.length).toBeGreaterThanOrEqual(1);
      expect(result.pagination).toMatchObject({
        page: 1,
        limit: 10,
        total: expect.any(Number),
        totalPages: expect.any(Number),
      });
    });

    it('filters posts by status', async () => {
      const res = await callMcpHttp(userARawKey, {
        jsonrpc: '2.0',
        id: 'list-posts-draft',
        method: 'tools/call',
        params: {
          name: 'list_posts',
          arguments: {
            status: 'published',
          },
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      const result = JSON.parse(body.result.content[0].text);
      // No published posts yet for Alice
      expect(result.posts).toHaveLength(0);
    });
  });

  // ── 6. publish_post Tool ─────────────────────────────────────────────────

  describe('6. publish_post via HTTP transport', () => {
    it('allows the owner to publish their draft post', async () => {
      // Create a draft post first
      const createRes = await callMcpHttp(userARawKey, {
        jsonrpc: '2.0',
        id: 'create-to-pub',
        method: 'tools/call',
        params: {
          name: 'create_post',
          arguments: {
            title: 'Post to be Published',
            content: 'Publishable body',
          },
        },
      });
      const createBody = await createRes.json();
      const postId = JSON.parse(createBody.result.content[0].text).id;

      // Publish the post
      const pubRes = await callMcpHttp(userARawKey, {
        jsonrpc: '2.0',
        id: 'pub-1',
        method: 'tools/call',
        params: {
          name: 'publish_post',
          arguments: {
            post_id: postId,
          },
        },
      });

      expect(pubRes.status).toBe(200);
      const pubBody = await pubRes.json();
      expect(pubBody.result.isError).toBeFalsy();

      const publishedPost = JSON.parse(pubBody.result.content[0].text);
      expect(publishedPost.status).toBe('published');
      expect(publishedPost.published_at).not.toBeNull();
    });

    it('returns an error when publishing an already published post', async () => {
      // Create and publish
      const createRes = await callMcpHttp(userARawKey, {
        jsonrpc: '2.0',
        id: 'create-already-pub',
        method: 'tools/call',
        params: {
          name: 'create_post',
          arguments: { title: 'Double Publish Test', content: 'Content' },
        },
      });
      const postId = JSON.parse((await createRes.json()).result.content[0].text).id;

      await callMcpHttp(userARawKey, {
        jsonrpc: '2.0',
        id: 'pub-first',
        method: 'tools/call',
        params: { name: 'publish_post', arguments: { post_id: postId } },
      });

      // Attempt to publish again
      const secondRes = await callMcpHttp(userARawKey, {
        jsonrpc: '2.0',
        id: 'pub-second',
        method: 'tools/call',
        params: { name: 'publish_post', arguments: { post_id: postId } },
      });

      const secondBody = await secondRes.json();
      expect(secondBody.result.isError).toBe(true);
      expect(secondBody.result.content[0].text).toContain('[ALREADY_PUBLISHED]');
    });

    it('returns an error when publishing a nonexistent post ID', async () => {
      const res = await callMcpHttp(userARawKey, {
        jsonrpc: '2.0',
        id: 'pub-missing',
        method: 'tools/call',
        params: {
          name: 'publish_post',
          arguments: {
            post_id: 999999,
          },
        },
      });

      const body = await res.json();
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toContain('[POST_NOT_FOUND]');
    });
  });

  // ── 7. get_analytics Tool ────────────────────────────────────────────────

  describe('7. get_analytics via HTTP transport', () => {
    it('retrieves account-level analytics when post_id is omitted', async () => {
      const res = await callMcpHttp(userARawKey, {
        jsonrpc: '2.0',
        id: 'analytics-account',
        method: 'tools/call',
        params: {
          name: 'get_analytics',
          arguments: {
            range: '30d',
          },
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.result.isError).toBeFalsy();

      const analytics = JSON.parse(body.result.content[0].text);
      expect(analytics).toMatchObject({
        total_views: expect.any(Number),
        unique_views: expect.any(Number),
        top_posts: expect.any(Array),
        range: '30d',
      });
    });

    it('retrieves post-level analytics when post_id is supplied', async () => {
      const postRepo = new PostRepository(db);
      const analyticsRepo = new AnalyticsRepository(db);
      const post = postRepo.create({
        user_id: userAId,
        title: 'Analytics Target Post',
        slug: 'analytics-target-post',
        content: 'Content',
        status: 'published',
      });

      analyticsRepo.insert({ post_id: post.id, user_id: userAId, event_type: 'page_view' });

      const res = await callMcpHttp(userARawKey, {
        jsonrpc: '2.0',
        id: 'analytics-post',
        method: 'tools/call',
        params: {
          name: 'get_analytics',
          arguments: {
            post_id: post.id,
            range: '7d',
          },
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.result.isError).toBeFalsy();

      const analytics = JSON.parse(body.result.content[0].text);
      expect(analytics).toMatchObject({
        post_id: post.id,
        title: 'Analytics Target Post',
        slug: 'analytics-target-post',
        total_views: 1,
        unique_views: 0,
        range: '7d',
      });
    });

    it('supports all range options (7d, 30d, 90d, all)', async () => {
      for (const range of ['7d', '30d', '90d', 'all'] as const) {
        const res = await callMcpHttp(userARawKey, {
          jsonrpc: '2.0',
          id: `analytics-range-${range}`,
          method: 'tools/call',
          params: {
            name: 'get_analytics',
            arguments: { range },
          },
        });

        const body = await res.json();
        expect(body.result.isError).toBeFalsy();
        const analytics = JSON.parse(body.result.content[0].text);
        expect(analytics.range).toBe(range);
      }
    });

    it('rejects analytics query for a nonexistent post', async () => {
      const res = await callMcpHttp(userARawKey, {
        jsonrpc: '2.0',
        id: 'analytics-missing',
        method: 'tools/call',
        params: {
          name: 'get_analytics',
          arguments: {
            post_id: 888888,
          },
        },
      });

      const body = await res.json();
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toContain('[POST_NOT_FOUND]');
    });
  });

  // ── 8. Security & Multi-User Ownership Isolation ─────────────────────────

  describe('8. Security & Multi-User Ownership Isolation', () => {
    let bobPostId: number;

    beforeAll(async () => {
      // Bob creates a private draft post
      const createRes = await callMcpHttp(userBRawKey, {
        jsonrpc: '2.0',
        id: 'bob-create',
        method: 'tools/call',
        params: {
          name: 'create_post',
          arguments: {
            title: 'Bob Secret Post',
            content: 'Confidential content belonging strictly to Bob',
          },
        },
      });
      const createBody = await createRes.json();
      bobPostId = JSON.parse(createBody.result.content[0].text).id;
    });

    it('prevents User A from seeing User B posts in list_posts', async () => {
      const res = await callMcpHttp(userARawKey, {
        jsonrpc: '2.0',
        id: 'alice-list',
        method: 'tools/call',
        params: {
          name: 'list_posts',
          arguments: { limit: 100 },
        },
      });

      const body = await res.json();
      const result = JSON.parse(body.result.content[0].text);
      const postIds = result.posts.map((p: { id: number }) => p.id);

      expect(postIds).not.toContain(bobPostId);
      expect(result.posts.every((p: { user_id?: number }) => p.user_id === undefined || p.user_id === userAId)).toBe(true);
    });

    it('prevents User A from publishing User B post', async () => {
      const res = await callMcpHttp(userARawKey, {
        jsonrpc: '2.0',
        id: 'alice-steal-pub',
        method: 'tools/call',
        params: {
          name: 'publish_post',
          arguments: {
            post_id: bobPostId,
          },
        },
      });

      const body = await res.json();
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toContain('[FORBIDDEN] Access denied');

      // Verify in DB that Bob's post remains draft
      const postRepo = new PostRepository(db);
      const bobPost = postRepo.findById(bobPostId);
      expect(bobPost?.status).toBe('draft');
      expect(bobPost?.published_at).toBeNull();
    });

    it('prevents User A from reading User B post analytics', async () => {
      const res = await callMcpHttp(userARawKey, {
        jsonrpc: '2.0',
        id: 'alice-steal-analytics',
        method: 'tools/call',
        params: {
          name: 'get_analytics',
          arguments: {
            post_id: bobPostId,
          },
        },
      });

      const body = await res.json();
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toContain('[FORBIDDEN] Access denied');
    });

    it('ensures Bob can publish and manage his own post', async () => {
      const res = await callMcpHttp(userBRawKey, {
        jsonrpc: '2.0',
        id: 'bob-pub-own',
        method: 'tools/call',
        params: {
          name: 'publish_post',
          arguments: {
            post_id: bobPostId,
          },
        },
      });

      const body = await res.json();
      expect(body.result.isError).toBeFalsy();
      const published = JSON.parse(body.result.content[0].text);
      expect(published.status).toBe('published');
    });
  });
});

