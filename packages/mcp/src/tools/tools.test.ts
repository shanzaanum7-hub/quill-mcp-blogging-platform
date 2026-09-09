/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { runMigrations, UserRepository, PostRepository, AnalyticsRepository } from '@quill/database';
import { createServiceContainer, type ServiceContainer } from '@quill/services';
import { AppError } from '@quill/shared';

import { registerCreatePostTool, toolError } from './createPost.tool.js';
import { registerListPostsTool } from './listPosts.tool.js';
import { registerPublishPostTool } from './publishPost.tool.js';
import { registerGetAnalyticsTool } from './getAnalytics.tool.js';

type ToolHandler = (args: Record<string, unknown>, extra?: unknown) => Promise<CallToolResult> | CallToolResult;

function extractTool(mcpServer: McpServer, toolName: string) {
  const serverAny = mcpServer as unknown as {
    _registeredTools?: Record<string, { callback: ToolHandler; inputSchema?: { safeParseAsync: (args: unknown) => Promise<{ success: boolean; error?: { message: string } }> } }>;
  };

  if (serverAny._registeredTools && serverAny._registeredTools[toolName]) {
    return serverAny._registeredTools[toolName].callback;
  }

  throw new Error(`Tool ${toolName} not found on McpServer`);
}

describe('MCP Tools Unit Tests', () => {
  let db: Database.Database;
  let services: ServiceContainer;
  let userRepo: UserRepository;
  let postRepo: PostRepository;
  let analyticsRepo: AnalyticsRepository;
  let userAId: number;
  let userBId: number;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    userRepo = new UserRepository(db);
    postRepo = new PostRepository(db);
    analyticsRepo = new AnalyticsRepository(db);
    services = createServiceContainer(db);

    const userA = userRepo.create({ username: 'usera', email: 'usera@example.com', password_hash: 'hash' });
    userAId = userA.id;

    const userB = userRepo.create({ username: 'userb', email: 'userb@example.com', password_hash: 'hash' });
    userBId = userB.id;
  });

  describe('toolError helper', () => {
    it('formats AppError with error code and message', () => {
      const result = toolError(new AppError('FORBIDDEN', 'Access denied', 403));
      expect(result).toEqual({
        content: [{ type: 'text', text: 'Error: [FORBIDDEN] Access denied' }],
        isError: true,
      });
    });

    it('formats standard Error with its message', () => {
      const result = toolError(new Error('Something failed'));
      expect(result).toEqual({
        content: [{ type: 'text', text: 'Error: Something failed' }],
        isError: true,
      });
    });

    it('handles non-error objects gracefully', () => {
      const result = toolError('string failure');
      expect(result).toEqual({
        content: [{ type: 'text', text: 'Error: An unexpected error occurred' }],
        isError: true,
      });
    });
  });

  describe('create_post tool', () => {
    it('creates a draft post belonging to the authenticated user', async () => {
      const mcpServer = new McpServer({ name: 'test', version: '1.0.0' });
      registerCreatePostTool(mcpServer, services, () => userAId);
      const handler = extractTool(mcpServer, 'create_post');

      const result = await handler({
        title: 'Post Title',
        content: 'Post body content in Markdown',
        excerpt: 'Short excerpt',
      });

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
      expect(parsed).toMatchObject({
        title: 'Post Title',
        slug: 'post-title',
        content: 'Post body content in Markdown',
        excerpt: 'Short excerpt',
        status: 'draft',
      });
    });

    it('creates a draft post without optional excerpt', async () => {
      const mcpServer = new McpServer({ name: 'test', version: '1.0.0' });
      registerCreatePostTool(mcpServer, services, () => userAId);
      const handler = extractTool(mcpServer, 'create_post');

      const result = await handler({
        title: 'Another Post',
        content: 'Another body',
      });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
      expect(parsed.excerpt).toBeNull();
    });
  });

  describe('list_posts tool', () => {
    it('lists only posts belonging to the authenticated user', async () => {
      postRepo.create({ user_id: userAId, title: 'User A Post 1', slug: 'user-a-1', content: 'A1', status: 'draft' });
      postRepo.create({ user_id: userAId, title: 'User A Post 2', slug: 'user-a-2', content: 'A2', status: 'published' });
      postRepo.create({ user_id: userBId, title: 'User B Post 1', slug: 'user-b-1', content: 'B1', status: 'published' });

      const mcpServer = new McpServer({ name: 'test', version: '1.0.0' });
      registerListPostsTool(mcpServer, services, () => userAId);
      const handler = extractTool(mcpServer, 'list_posts');

      const result = await handler({ page: 1, limit: 20 });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
      expect(parsed.posts).toHaveLength(2);
      expect(parsed.posts.every((p: { title: string }) => p.title.startsWith('User A'))).toBe(true);
      expect(parsed.pagination.total).toBe(2);
    });

    it('filters posts by status', async () => {
      postRepo.create({ user_id: userAId, title: 'Draft Post', slug: 'draft-p', content: 'D', status: 'draft' });
      postRepo.create({ user_id: userAId, title: 'Published Post', slug: 'published-p', content: 'P', status: 'published' });

      const mcpServer = new McpServer({ name: 'test', version: '1.0.0' });
      registerListPostsTool(mcpServer, services, () => userAId);
      const handler = extractTool(mcpServer, 'list_posts');

      const result = await handler({ status: 'published', page: 1, limit: 10 });
      const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
      expect(parsed.posts).toHaveLength(1);
      expect(parsed.posts[0].title).toBe('Published Post');
    });

    it('handles pagination correctly', async () => {
      for (let i = 1; i <= 5; i++) {
        postRepo.create({ user_id: userAId, title: `Post ${i}`, slug: `post-${i}`, content: `C${i}`, status: 'draft' });
      }

      const mcpServer = new McpServer({ name: 'test', version: '1.0.0' });
      registerListPostsTool(mcpServer, services, () => userAId);
      const handler = extractTool(mcpServer, 'list_posts');

      const page1Result = await handler({ page: 1, limit: 2 });
      const page1 = JSON.parse((page1Result.content[0] as { type: string; text: string }).text);
      expect(page1.posts).toHaveLength(2);
      expect(page1.pagination.totalPages).toBe(3);

      const page2Result = await handler({ page: 2, limit: 2 });
      const page2 = JSON.parse((page2Result.content[0] as { type: string; text: string }).text);
      expect(page2.posts).toHaveLength(2);
      expect(page2.posts[0].id).not.toBe(page1.posts[0].id);
    });
  });

  describe('publish_post tool', () => {
    it('publishes a draft post belonging to the user', async () => {
      const created = postRepo.create({
        user_id: userAId,
        title: 'Draft to Publish',
        slug: 'draft-to-publish',
        content: 'Content',
        status: 'draft',
      });

      const mcpServer = new McpServer({ name: 'test', version: '1.0.0' });
      registerPublishPostTool(mcpServer, services, () => userAId);
      const handler = extractTool(mcpServer, 'publish_post');

      const result = await handler({ post_id: created.id });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
      expect(parsed.status).toBe('published');
      expect(parsed.published_at).not.toBeNull();
    });

    it('rejects publishing when post belongs to another user', async () => {
      const postB = postRepo.create({
        user_id: userBId,
        title: 'User B Secret Post',
        slug: 'user-b-secret',
        content: 'Content',
        status: 'draft',
      });

      const mcpServer = new McpServer({ name: 'test', version: '1.0.0' });
      registerPublishPostTool(mcpServer, services, () => userAId);
      const handler = extractTool(mcpServer, 'publish_post');

      const result = await handler({ post_id: postB.id });
      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('[FORBIDDEN] Access denied');
    });

    it('rejects publishing a nonexistent post', async () => {
      const mcpServer = new McpServer({ name: 'test', version: '1.0.0' });
      registerPublishPostTool(mcpServer, services, () => userAId);
      const handler = extractTool(mcpServer, 'publish_post');

      const result = await handler({ post_id: 999999 });
      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('[POST_NOT_FOUND]');
    });

    it('rejects publishing an already published post', async () => {
      const post = postRepo.create({
        user_id: userAId,
        title: 'Already Published',
        slug: 'already-published',
        content: 'Content',
        status: 'published',
      });

      const mcpServer = new McpServer({ name: 'test', version: '1.0.0' });
      registerPublishPostTool(mcpServer, services, () => userAId);
      const handler = extractTool(mcpServer, 'publish_post');

      const result = await handler({ post_id: post.id });
      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('[ALREADY_PUBLISHED]');
    });
  });

  describe('get_analytics tool', () => {
    it('retrieves account-level analytics when post_id is omitted', async () => {
      const post = postRepo.create({
        user_id: userAId,
        title: 'Post with Views',
        slug: 'post-with-views',
        content: 'Content',
        status: 'published',
      });
      analyticsRepo.insert({ post_id: post.id, user_id: userAId, event_type: 'page_view' });
      analyticsRepo.insert({ post_id: post.id, user_id: userAId, event_type: 'unique_view' });

      const mcpServer = new McpServer({ name: 'test', version: '1.0.0' });
      registerGetAnalyticsTool(mcpServer, services, () => userAId);
      const handler = extractTool(mcpServer, 'get_analytics');

      const result = await handler({ range: '30d' });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
      expect(parsed).toMatchObject({
        total_views: 1,
        unique_views: 1,
        range: '30d',
      });
      expect(parsed.top_posts).toHaveLength(1);
    });

    it('retrieves post-level analytics when post_id is provided', async () => {
      const post = postRepo.create({
        user_id: userAId,
        title: 'Target Post',
        slug: 'target-post',
        content: 'Content',
        status: 'published',
      });
      analyticsRepo.insert({ post_id: post.id, user_id: userAId, event_type: 'page_view' });

      const mcpServer = new McpServer({ name: 'test', version: '1.0.0' });
      registerGetAnalyticsTool(mcpServer, services, () => userAId);
      const handler = extractTool(mcpServer, 'get_analytics');

      const result = await handler({ post_id: post.id, range: '7d' });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
      expect(parsed).toMatchObject({
        post_id: post.id,
        title: 'Target Post',
        slug: 'target-post',
        total_views: 1,
        unique_views: 0,
        range: '7d',
      });
    });

    it('rejects access to another user post analytics', async () => {
      const postB = postRepo.create({
        user_id: userBId,
        title: 'User B Analytics Post',
        slug: 'user-b-analytics',
        content: 'Content',
        status: 'published',
      });

      const mcpServer = new McpServer({ name: 'test', version: '1.0.0' });
      registerGetAnalyticsTool(mcpServer, services, () => userAId);
      const handler = extractTool(mcpServer, 'get_analytics');

      const result = await handler({ post_id: postB.id });
      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('[FORBIDDEN] Access denied');
    });

    it('rejects analytics for nonexistent post', async () => {
      const mcpServer = new McpServer({ name: 'test', version: '1.0.0' });
      registerGetAnalyticsTool(mcpServer, services, () => userAId);
      const handler = extractTool(mcpServer, 'get_analytics');

      const result = await handler({ post_id: 88888 });
      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('[POST_NOT_FOUND]');
    });
  });
});

