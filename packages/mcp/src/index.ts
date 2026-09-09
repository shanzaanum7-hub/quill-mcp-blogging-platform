/**
 * @quill/mcp — entry point
 * Loads environment, initializes the database and services,
 * creates the MCP server, and starts listening.
 */

import { createDatabaseClient, runMigrations } from '@quill/database';
import { loadEnv } from '@quill/shared';
import { createServiceContainer } from '@quill/services';
import { createMcpServer } from './server.js';

async function main(): Promise<void> {
  let config;

  try {
    config = loadEnv();
  } catch (err) {
    console.error('[quill/mcp] Environment configuration error:');
    console.error((err as Error).message);
    process.exit(1);
    return;
  }

  const db = createDatabaseClient(config.DATABASE_PATH);

  try {
    runMigrations(db);
  } catch (err) {
    console.error('[quill/mcp] Database migration error:');
    console.error(err);
    db.close();
    process.exit(1);
    return;
  }

  const services = createServiceContainer(db);
  const mcpServer = createMcpServer(config, services);

  try {
    await mcpServer.start(config.PORT_MCP);
  } catch (err) {
    console.error('[quill/mcp] Failed to start server:', err);
    db.close();
    process.exit(1);
    return;
  }

  const shutdown = (): void => {
    mcpServer
      .stop()
      .then(() => {
        db.close();
        process.exit(0);
      })
      .catch((err: unknown) => {
        console.error('[quill/mcp] Error during shutdown:', err);
        db.close();
        process.exit(1);
      });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

void main();