import Fastify, { type FastifyServerOptions } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import session from '@fastify/session';
import rateLimit from '@fastify/rate-limit';
import { AppError, type EnvConfig } from '@quill/shared';
import { ZodError } from 'zod';
import { createDatabaseClient, runMigrations } from '@quill/database';
import { createServiceContainer, type ServiceContainer } from '@quill/services';
import { registerAuthRoutes } from './routes.js';
import { registerSecurityHeaders } from './securityHeaders.js';

/**
 * Creates and configures the Fastify application instance.
 * Accepts config so the factory can be used in tests without side effects.
 *
 * Note: pino-pretty is intentionally not used to avoid an extra runtime
 * dependency. JSON logs are parsed by standard log viewers in all envs.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export async function createApp(config: EnvConfig, services?: ServiceContainer) {
  const loggerOptions: FastifyServerOptions['logger'] = {
    level: config.LOG_LEVEL,
  };

  const app = Fastify({ logger: loggerOptions });
  await registerSecurityHeaders(app, config.NODE_ENV === 'production');
  const db = createDatabaseClient(config.DATABASE_PATH);
  runMigrations(db);
  const container = services ?? createServiceContainer(db);

  await app.register(cors, { origin: config.CORS_ORIGINS, credentials: true });
  await app.register(cookie);
  await app.register(session, {
    secret: config.SESSION_SECRET,
    cookieName: 'quill_session',
    cookie: {
      path: '/',
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
    },
    saveUninitialized: false,
  });
  await app.register(rateLimit, { global: true, max: config.RATE_LIMIT_API_RPM, timeWindow: '1 minute' });
  await registerAuthRoutes(app, {
    auth: container.authService,
    apiKeys: container.apiKeyService,
    posts: container.postService,
    analytics: container.analyticsService,
    rateLimitApiRpm: config.RATE_LIMIT_API_RPM,
  });

  // ── Global error handler ──────────────────────────────────────────────────
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Request validation failed' },
      });
    }

    // Fastify schema validation error
    if (error.validation) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.message },
      });
    }

    // Unhandled — log full error, never leak details in production
    request.log.error(error);
    const message =
      config.NODE_ENV === 'production' ? 'An unexpected error occurred' : error.message;

    return reply.status(500).send({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  });

  // ── Health endpoint ───────────────────────────────────────────────────────
  app.get('/health', { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } }, async (_request, reply) => {
    let healthy = false;
    try {
      healthy = db.open && Boolean(db.prepare('SELECT 1').get());
    } catch {
      healthy = false;
    }
    return reply.status(healthy ? 200 : 503).send({
      status: healthy ? 'ok' : 'degraded',
      db: healthy ? 'connected' : 'error',
      uptime: process.uptime(),
      version: '1.0.0',
    });
  });

  // ── 404 handler ───────────────────────────────────────────────────────────
  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  return app;
}
