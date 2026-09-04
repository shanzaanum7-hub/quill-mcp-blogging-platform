/**
 * @quill/mcp — entry point
 * Loads environment, creates the MCP server, starts listening.
 */
import { loadEnv } from '@quill/shared';
import { createMcpServer } from './server.js';

async function main(): Promise<void> {
  let config;
  try {
    config = loadEnv();
  } catch (err) {
    console.error('[quill/mcp] Environment configuration error:');
    console.error((err as Error).message);
    process.exit(1);
  }

  const mcpServer = createMcpServer(config);

  try {
    await mcpServer.start(config.PORT_MCP);
  } catch (err) {
    console.error('[quill/mcp] Failed to start server:', err);
    process.exit(1);
  }

  // Graceful shutdown — process.on callbacks must be synchronous wrappers
  const shutdown = (): void => {
    mcpServer
      .stop()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        console.error('[quill/mcp] Error during shutdown:', err);
        process.exit(1);
      });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

void main();
