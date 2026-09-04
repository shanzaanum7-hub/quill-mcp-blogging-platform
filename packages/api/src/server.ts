import Fastify, { type FastifyServerOptions } from 'fastify';
import { AppError } from '@quill/shared';
import type { EnvConfig } from '@quill/shared';

/**
 * Creates and configures the Fastify application instance.
 * Accepts config so the factory can be used in tests without side effects.
 *
 * Note: pino-pretty is intentionally not used to avoid an extra runtime
 * dependency. JSON logs are parsed by standard log viewers in all envs.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export async function createApp(config: EnvConfig) {
  const loggerOptions: FastifyServerOptions['logger'] = {
    level: config.LOG_LEVEL,
  };

  const app = Fastify({ logger: loggerOptions });

  // ── Global error handler ──────────────────────────────────────────────────
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message },
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
  app.get('/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      server: 'api',
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
