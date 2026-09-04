/**
 * @quill/api — entry point
 * Loads environment, creates the Fastify app, starts listening.
 */
import { loadEnv } from '@quill/shared';
import { createApp } from './server.js';

async function main(): Promise<void> {
  // Validate all required environment variables before doing anything else.
  // Will throw with a descriptive message and exit if any are missing.
  let config;
  try {
    config = loadEnv();
  } catch (err) {
    console.error('[quill/api] Environment configuration error:');
    console.error((err as Error).message);
    process.exit(1);
  }

  const app = await createApp(config);

  try {
    await app.listen({ port: config.PORT_API, host: '0.0.0.0' });
    app.log.info(`API server listening on port ${config.PORT_API}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
