import type { OpenAPIV3 } from 'openapi-types';

const json = (description: string, schema: object = { type: 'object' }) => ({
  description,
  content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: schema } } } },
});

const errorResponse = (description: string) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { $ref: '#/components/schemas/Error' },
        },
      },
    },
  },
});

const sessionSecurity = [{ sessionCookie: [] }];
const idParameter = (name: string, description: string) => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'integer', minimum: 1 },
});

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Quill REST API',
    version: '1.0.0',
    description: 'REST API for account management, post publishing, public blog content, and analytics.',
  },
  servers: [{ url: 'http://localhost:3001', description: 'Local API server' }],
  tags: [
    { name: 'Authentication', description: 'Account registration and session authentication.' },
    { name: 'API keys', description: 'Manage API keys used by the MCP server.' },
    { name: 'Posts', description: 'Authenticated post authoring and publishing.' },
    { name: 'Analytics', description: 'Authenticated post and account analytics.' },
    { name: 'Public blog', description: 'Published blog content and server-side page-view tracking.' },
    { name: 'System', description: 'Service health information.' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Check API and database health',
        responses: { '200': json('The API and database are healthy.'), '503': json('The database is unavailable.') },
      },
    },
    '/api/auth/register': {
      post: {
        tags: ['Authentication'], summary: 'Register an account',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } } } },
        responses: { '201': json('Account created.', { $ref: '#/components/schemas/User' }), '400': errorResponse('Invalid registration data.'), '409': errorResponse('Email or username already exists.') },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Authentication'], summary: 'Create a session',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } },
        responses: { '200': json('Authenticated user.', { $ref: '#/components/schemas/User' }), '400': errorResponse('Invalid login data.'), '401': errorResponse('Invalid credentials.') },
      },
    },
    '/api/auth/logout': {
      post: {
        tags: ['Authentication'], summary: 'Destroy the current session', security: sessionSecurity,
        responses: { '200': json('Session destroyed.'), '401': errorResponse('Authentication required.') },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Authentication'], summary: 'Get the authenticated account', security: sessionSecurity,
        responses: { '200': json('Authenticated account.', { $ref: '#/components/schemas/User' }), '401': errorResponse('Authentication required.') },
      },
    },
    '/api/keys': {
      get: {
        tags: ['API keys'], summary: 'List the account API keys', security: sessionSecurity,
        responses: { '200': json('API keys.', { type: 'array', items: { $ref: '#/components/schemas/ApiKey' } }), '401': errorResponse('Authentication required.') },
      },
      post: {
        tags: ['API keys'], summary: 'Create an API key', security: sessionSecurity,
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateApiKeyRequest' } } } },
        responses: { '201': json('API key created. The raw key is returned only when created.', { $ref: '#/components/schemas/CreatedApiKey' }), '400': errorResponse('Invalid API key name.'), '401': errorResponse('Authentication required.') },
      },
    },
    '/api/keys/{id}': {
      delete: {
        tags: ['API keys'], summary: 'Revoke an API key', security: sessionSecurity, parameters: [idParameter('id', 'API key ID')],
        responses: { '200': json('API key revoked.'), '401': errorResponse('Authentication required.'), '403': errorResponse('The key does not belong to the account.') },
      },
    },
    '/api/posts': {
      get: {
        tags: ['Posts'], summary: 'List the authenticated account posts', security: sessionSecurity,
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'published', 'scheduled'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: { '200': json('Paginated post summaries.', { $ref: '#/components/schemas/PaginatedPosts' }), '401': errorResponse('Authentication required.') },
      },
      post: {
        tags: ['Posts'], summary: 'Create a draft post', security: sessionSecurity,
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreatePostRequest' } } } },
        responses: { '201': json('Draft post created.', { $ref: '#/components/schemas/Post' }), '400': errorResponse('Invalid post data.'), '401': errorResponse('Authentication required.') },
      },
    },
    '/api/posts/{id}': {
      get: { tags: ['Posts'], summary: 'Get an owned post', security: sessionSecurity, parameters: [idParameter('id', 'Post ID')], responses: { '200': json('Post.', { $ref: '#/components/schemas/Post' }), '401': errorResponse('Authentication required.'), '403': errorResponse('Post access denied.'), '404': errorResponse('Post not found.') } },
      put: { tags: ['Posts'], summary: 'Update an owned post', security: sessionSecurity, parameters: [idParameter('id', 'Post ID')], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdatePostRequest' } } } }, responses: { '200': json('Updated post.', { $ref: '#/components/schemas/Post' }), '400': errorResponse('Invalid post data.'), '401': errorResponse('Authentication required.'), '403': errorResponse('Post access denied.'), '404': errorResponse('Post not found.') } },
      delete: { tags: ['Posts'], summary: 'Delete an owned post', security: sessionSecurity, parameters: [idParameter('id', 'Post ID')], responses: { '200': json('Post deleted.'), '401': errorResponse('Authentication required.'), '403': errorResponse('Post access denied.'), '404': errorResponse('Post not found.') } },
    },
    '/api/posts/{id}/publish': { post: { tags: ['Posts'], summary: 'Publish a post immediately', security: sessionSecurity, parameters: [idParameter('id', 'Post ID')], responses: { '200': json('Published post.', { $ref: '#/components/schemas/Post' }), '401': errorResponse('Authentication required.'), '403': errorResponse('Post access denied.'), '404': errorResponse('Post not found.'), '409': errorResponse('Post is already published.') } } },
    '/api/posts/{id}/unpublish': { post: { tags: ['Posts'], summary: 'Return a post to draft status', security: sessionSecurity, parameters: [idParameter('id', 'Post ID')], responses: { '200': json('Unpublished post.', { $ref: '#/components/schemas/Post' }), '401': errorResponse('Authentication required.'), '403': errorResponse('Post access denied.'), '404': errorResponse('Post not found.') } } },
    '/api/posts/{id}/schedule': { post: { tags: ['Posts'], summary: 'Schedule a post', security: sessionSecurity, parameters: [idParameter('id', 'Post ID')], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SchedulePostRequest' } } } }, responses: { '200': json('Scheduled post.', { $ref: '#/components/schemas/Post' }), '400': errorResponse('Invalid schedule.'), '401': errorResponse('Authentication required.'), '403': errorResponse('Post access denied.'), '404': errorResponse('Post not found.') } } },
    '/api/posts/{id}/seo': { put: { tags: ['Posts'], summary: 'Update post SEO metadata', security: sessionSecurity, parameters: [idParameter('id', 'Post ID')], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SeoRequest' } } } }, responses: { '200': json('Updated post.', { $ref: '#/components/schemas/Post' }), '400': errorResponse('Invalid SEO data.'), '401': errorResponse('Authentication required.'), '403': errorResponse('Post access denied.'), '404': errorResponse('Post not found.') } } },
    '/api/analytics': {
      get: {
        tags: ['Analytics'], summary: 'Get account analytics', security: sessionSecurity,
        parameters: [{ name: 'range', in: 'query', schema: { type: 'string', enum: ['7d', '30d', '90d', 'all'], default: '30d' } }],
        responses: { '200': json('Account analytics.', { $ref: '#/components/schemas/AccountAnalytics' }), '400': errorResponse('Invalid analytics range.'), '401': errorResponse('Authentication required.') },
      },
    },
    '/api/analytics/{postId}': {
      get: {
        tags: ['Analytics'], summary: 'Get analytics for an owned post', security: sessionSecurity, parameters: [idParameter('postId', 'Post ID'), { name: 'range', in: 'query', schema: { type: 'string', enum: ['7d', '30d', '90d', 'all'], default: '30d' } }],
        responses: { '200': json('Post analytics.', { $ref: '#/components/schemas/PostAnalytics' }), '400': errorResponse('Invalid analytics range or post ID.'), '401': errorResponse('Authentication required.'), '403': errorResponse('Post access denied.'), '404': errorResponse('Post not found.') },
      },
    },
    '/api/public/{username}/posts': {
      get: {
        tags: ['Public blog'], summary: 'List published posts for a user', parameters: [{ name: 'username', in: 'path', required: true, schema: { type: 'string' } }, { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } }, { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 20, default: 10 } }],
        responses: { '200': json('Published posts and author details.', { $ref: '#/components/schemas/PublicPosts' }), '400': errorResponse('Invalid pagination.'), '404': errorResponse('User not found.') },
      },
    },
    '/api/public/{username}/posts/{slug}': {
      get: {
        tags: ['Public blog'], summary: 'Get a published post and record a page view', parameters: [{ name: 'username', in: 'path', required: true, schema: { type: 'string' } }, { name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': json('Published post. A page_view event is recorded server-side.'), '404': errorResponse('User or post not found.') },
      },
    },
  },
  components: {
    securitySchemes: {
      sessionCookie: { type: 'apiKey', in: 'cookie', name: 'quill_session', description: 'Session cookie created by POST /api/auth/login.' },
      bearerApiKey: { type: 'http', scheme: 'bearer', description: 'API keys are used by the separate MCP server, not by the REST routes documented here.' },
    },
    schemas: {
      Error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } }, required: ['code', 'message'] },
      User: { type: 'object', properties: { id: { type: 'integer' }, username: { type: 'string' }, email: { type: 'string', format: 'email' }, display_name: { type: ['string', 'null'] }, bio: { type: ['string', 'null'] }, created_at: { type: 'string', format: 'date-time' } }, required: ['id', 'username', 'email', 'created_at'] },
      RegisterRequest: { type: 'object', required: ['username', 'email', 'password'], properties: { username: { type: 'string', minLength: 3, maxLength: 30 }, email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password', minLength: 8, maxLength: 128 } } },
      LoginRequest: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password' } } },
      CreateApiKeyRequest: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 64 } } },
      ApiKey: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, key_prefix: { type: 'string' }, last_used_at: { type: ['string', 'null'], format: 'date-time' }, revoked: { type: 'boolean' }, created_at: { type: 'string', format: 'date-time' } }, required: ['id', 'name', 'key_prefix', 'revoked', 'created_at'] },
      CreatedApiKey: { allOf: [{ $ref: '#/components/schemas/ApiKey' }, { type: 'object', properties: { raw_key: { type: 'string', description: 'Shown only in this creation response.' } } }] },
      CreatePostRequest: { type: 'object', required: ['title', 'content'], properties: { title: { type: 'string', minLength: 1, maxLength: 200 }, content: { type: 'string', minLength: 1 }, excerpt: { type: 'string', maxLength: 500 } } },
      UpdatePostRequest: { type: 'object', minProperties: 1, properties: { title: { type: 'string', minLength: 1, maxLength: 200 }, content: { type: 'string', minLength: 1 }, excerpt: { type: 'string', maxLength: 500 } } },
      SchedulePostRequest: { type: 'object', required: ['scheduled_for'], properties: { scheduled_for: { type: 'string', format: 'date-time' } } },
      SeoRequest: { type: 'object', minProperties: 1, properties: { seo_title: { type: 'string', maxLength: 60 }, seo_description: { type: 'string', maxLength: 160 }, seo_keywords: { type: 'string', maxLength: 200 }, canonical_url: { type: 'string', format: 'uri', pattern: '^https://' } } },
      Post: { type: 'object', properties: { id: { type: 'integer' }, title: { type: 'string' }, slug: { type: 'string' }, content: { type: 'string' }, excerpt: { type: ['string', 'null'] }, status: { type: 'string', enum: ['draft', 'published', 'scheduled'] }, published_at: { type: ['string', 'null'], format: 'date-time' }, scheduled_for: { type: ['string', 'null'], format: 'date-time' }, created_at: { type: 'string', format: 'date-time' }, updated_at: { type: 'string', format: 'date-time' } } },
      PaginatedPosts: { type: 'object', properties: { posts: { type: 'array', items: { $ref: '#/components/schemas/Post' } }, pagination: { $ref: '#/components/schemas/Pagination' } } },
      PublicPosts: { type: 'object', properties: { author: { type: 'object' }, posts: { type: 'array', items: { $ref: '#/components/schemas/PublicPost' } }, pagination: { $ref: '#/components/schemas/Pagination' } } },
      PublicPost: { type: 'object', properties: { title: { type: 'string' }, slug: { type: 'string' }, excerpt: { type: ['string', 'null'] }, published_at: { type: ['string', 'null'], format: 'date-time' }, content: { type: 'string' }, seo_title: { type: ['string', 'null'] }, seo_description: { type: ['string', 'null'] } } },
      Pagination: { type: 'object', properties: { page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' } } },
      AccountAnalytics: { type: 'object', properties: { total_views: { type: 'integer' }, unique_views: { type: 'integer' }, top_posts: { type: 'array', items: { $ref: '#/components/schemas/AnalyticsPost' } }, range: { type: 'string', enum: ['7d', '30d', '90d', 'all'] } } },
      PostAnalytics: { type: 'object', properties: { post_id: { type: 'integer' }, title: { type: 'string' }, slug: { type: 'string' }, total_views: { type: 'integer' }, unique_views: { type: 'integer' }, range: { type: 'string', enum: ['7d', '30d', '90d', 'all'] } } },
      AnalyticsPost: { type: 'object', properties: { post_id: { type: 'integer' }, title: { type: 'string' }, slug: { type: 'string' }, total_views: { type: 'integer' }, unique_views: { type: 'integer' } } },
    },
  },
} as unknown as OpenAPIV3.Document;