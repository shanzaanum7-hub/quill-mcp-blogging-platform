import type { FastifyInstance } from 'fastify';
import { AppError, createApiKeySchema, createPostSchema, listPostsSchema, loginSchema, registerSchema, schedulePostSchema, seoSchema, updatePostSchema } from '@quill/shared';
import type { AuthService, ApiKeyService, AnalyticsService, PostService } from '@quill/services';
import { requireSession, type SessionData } from './auth.js';

type RouteDeps = {
  auth: AuthService;
  apiKeys: ApiKeyService;
  posts: PostService;
  analytics: AnalyticsService;
  rateLimitApiRpm: number;
};

function routeId(request: { params: unknown }): number {
  const id = Number((request.params as { id?: string }).id);
  if (!Number.isInteger(id) || id < 1) throw new AppError('VALIDATION_ERROR', 'Invalid resource ID', 400);
  return id;
}

export function registerAuthRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.post('/api/auth/register', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const data = registerSchema.parse(request.body);
    const user = await deps.auth.register(data);
    return reply.status(201).send({ success: true, data: user });
  });

  app.post('/api/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const data = loginSchema.parse(request.body);
    const user = await deps.auth.login(data);
    await request.session.regenerate();
    (request.session as unknown as { data: SessionData }).data = {
      userId: user.id,
      email: user.email,
      username: user.username,
      createdAt: Date.now(),
    };
    return reply.send({ success: true, data: user });
  });

  app.post('/api/auth/logout', { preHandler: requireSession }, async (request, reply) => {
    await request.session.destroy();
    return reply.clearCookie('session').send({ success: true });
  });

  app.get('/api/auth/me', { preHandler: requireSession }, async (request, reply) => {
    const user = deps.auth.getUserById(request.auth.userId);
    return reply.send({ success: true, data: user });
  });

  app.get('/api/keys', { preHandler: requireSession }, async (request, reply) => {
    return reply.send({ success: true, data: deps.apiKeys.listKeys(request.auth.userId) });
  });

  app.post('/api/keys', { preHandler: requireSession }, async (request, reply) => {
    const { name } = createApiKeySchema.parse(request.body);
    const key = deps.apiKeys.createKey(request.auth.userId, name);
    return reply.status(201).send({ success: true, data: key });
  });

  app.delete('/api/keys/:id', { preHandler: requireSession }, async (request, reply) => {
    deps.apiKeys.revokeKey(request.auth.userId, routeId(request));
    return reply.send({ success: true });
  });

  app.get('/api/posts', { preHandler: requireSession }, async (request, reply) => {
    const filters = listPostsSchema.parse(request.query);
    return reply.send({ success: true, data: deps.posts.listPosts(request.auth.userId, filters) });
  });

  app.post('/api/posts', { preHandler: requireSession }, async (request, reply) => {
    const data = createPostSchema.parse(request.body);
    return reply.status(201).send({ success: true, data: deps.posts.createPost(request.auth.userId, data) });
  });

  app.get('/api/posts/:id', { preHandler: requireSession }, async (request, reply) => {
    return reply.send({ success: true, data: deps.posts.getPost(request.auth.userId, routeId(request)) });
  });

  app.put('/api/posts/:id', { preHandler: requireSession }, async (request, reply) => {
    const data = updatePostSchema.parse(request.body);
    return reply.send({ success: true, data: deps.posts.updatePost(request.auth.userId, routeId(request), data) });
  });

  app.delete('/api/posts/:id', { preHandler: requireSession }, async (request, reply) => {
    deps.posts.deletePost(request.auth.userId, routeId(request));
    return reply.send({ success: true });
  });

  app.post('/api/posts/:id/publish', { preHandler: requireSession }, async (request, reply) => {
    return reply.send({ success: true, data: deps.posts.publishPost(request.auth.userId, routeId(request)) });
  });

  app.post('/api/posts/:id/unpublish', { preHandler: requireSession }, async (request, reply) => {
    return reply.send({ success: true, data: deps.posts.unpublishPost(request.auth.userId, routeId(request)) });
  });

  app.post('/api/posts/:id/schedule', { preHandler: requireSession }, async (request, reply) => {
    const { scheduled_for: scheduledFor } = schedulePostSchema.parse(request.body);
    return reply.send({ success: true, data: deps.posts.schedulePost(request.auth.userId, routeId(request), scheduledFor) });
  });

  app.put('/api/posts/:id/seo', { preHandler: requireSession }, async (request, reply) => {
    const data = seoSchema.parse(request.body);
    return reply.send({ success: true, data: deps.posts.manageSeo(request.auth.userId, routeId(request), data) });
  });

  app.get('/api/analytics', { preHandler: requireSession }, async (request, reply) => {
    const range = ((request.query as { range?: string }).range ?? '30d');
    if (!['7d', '30d', '90d', 'all'].includes(range)) throw new AppError('VALIDATION_ERROR', 'Invalid analytics range', 400);
    return reply.send({ success: true, data: deps.analytics.getAccountAnalytics(request.auth.userId, range as '7d' | '30d' | '90d' | 'all') });
  });

  app.get('/api/analytics/:postId', { preHandler: requireSession }, async (request, reply) => {
    const postId = Number((request.params as { postId: string }).postId);
    if (!Number.isInteger(postId) || postId < 1) throw new AppError('VALIDATION_ERROR', 'Invalid resource ID', 400);
    const range = ((request.query as { range?: string }).range ?? '30d');
    if (!['7d', '30d', '90d', 'all'].includes(range)) throw new AppError('VALIDATION_ERROR', 'Invalid analytics range', 400);
    return reply.send({ success: true, data: deps.analytics.getPostAnalytics(request.auth.userId, postId, range as '7d' | '30d' | '90d' | 'all') });
  });

  app.get('/api/public/:username/posts', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const query = request.query as { page?: string; limit?: string };
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 20) throw new AppError('VALIDATION_ERROR', 'Invalid pagination', 400);
    return reply.send({ success: true, data: deps.posts.getPublicPosts((request.params as { username: string }).username, page, limit) });
  });

  app.get('/api/public/:username/posts/:slug', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const params = request.params as { username: string; slug: string };
    return reply.send({ success: true, data: deps.posts.getPublicPost(params.username, params.slug) });
  });
}