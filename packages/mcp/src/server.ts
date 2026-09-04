import http from 'node:http';
import type { EnvConfig } from '@quill/shared';

export type McpServerInstance = {
  start(port: number): Promise<void>;
  stop(): Promise<void>;
};

/**
 * Creates the MCP server instance.
 * Full MCP tool registration is implemented in Spec 06/07.
 * This stub exposes a /health endpoint so the foundation is verifiable.
 */
export function createMcpServer(config: EnvConfig): McpServerInstance {
  const server = http.createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          server: 'mcp',
          uptime: process.uptime(),
          version: '1.0.0',
        }),
      );
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return {
    start(port: number): Promise<void> {
      return new Promise((resolve, reject) => {
        server.listen(port, '0.0.0.0', () => {
          // eslint-disable-next-line no-console
          console.info(`[quill/mcp] MCP server listening on port ${port} (NODE_ENV=${config.NODE_ENV})`);
          resolve();
        });
        server.once('error', reject);
      });
    },
    stop(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
