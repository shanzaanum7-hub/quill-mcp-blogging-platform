import http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { EnvConfig } from '@quill/shared';
import type { ServiceContainer } from '@quill/services';

import { verifyRequestApiKey } from './auth/apiKeyMiddleware.js';
import { registerCreatePostTool } from './tools/createPost.tool.js';
import { registerListPostsTool } from './tools/listPosts.tool.js';
import { registerPublishPostTool } from './tools/publishPost.tool.js';
import { registerGetAnalyticsTool } from './tools/getAnalytics.tool.js';

export type McpServerInstance = {
  start(port: number): Promise<void>;
  stop(): Promise<void>;
};

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
  });

  res.end(JSON.stringify(body));
}

async function readJsonBody(
  req: http.IncomingMessage,
): Promise<unknown> {
  if (req.method !== 'POST') {
    return undefined;
  }

  return new Promise<unknown>((resolve, reject) => {
    let rawBody = '';

    req.setEncoding('utf8');

    req.on('data', (chunk: string) => {
      rawBody += chunk;
    });

    req.on('end', () => {
      if (!rawBody.trim()) {
        resolve(undefined);
        return;
      }

      try {
        resolve(JSON.parse(rawBody) as unknown);
      } catch {
        reject(new Error('Invalid JSON request body'));
      }
    });

    req.on('error', (error: Error) => {
      reject(error);
    });
  });
}

function createMcpSdkServer(
  services: ServiceContainer,
  userId: number,
): McpServer {
  const mcpServer = new McpServer({
    name: 'quill-mcp',
    version: '1.0.0',
  });

  const getUserId = (): number => userId;

  registerCreatePostTool(
    mcpServer,
    services,
    getUserId,
  );

  registerListPostsTool(
    mcpServer,
    services,
    getUserId,
  );

  registerPublishPostTool(
    mcpServer,
    services,
    getUserId,
  );

  registerGetAnalyticsTool(
    mcpServer,
    services,
    getUserId,
  );

  return mcpServer;
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  services: ServiceContainer,
): Promise<void> {
  // Health check
  if (req.url === '/health' && req.method === 'GET') {
    sendJson(res, 200, {
      status: 'ok',
      server: 'mcp',
      uptime: process.uptime(),
      version: '1.0.0',
    });

    return;
  }

  // Only MCP endpoint is supported
  if (req.url !== '/mcp') {
    sendJson(res, 404, {
      error: 'Not found',
    });

    return;
  }

  try {
    // Authenticate MCP request using the same API-key service
    // used by the REST API.
    const auth = verifyRequestApiKey(
      req,
      services.apiKeyService,
    );

    // Parse JSON request body.
    const parsedBody = await readJsonBody(req);

    // Create an MCP SDK server for the authenticated user.
    const mcpServer = createMcpSdkServer(
      services,
      auth.userId,
    );

    // Stateless Streamable HTTP transport.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await mcpServer.connect(
      transport as unknown as Parameters<
        McpServer['connect']
      >[0],
    );

    await transport.handleRequest(
      req,
      res,
      parsedBody,
    );
  } catch (error) {
    if (res.headersSent) {
      return;
    }

    const message =
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred';

    const statusCode =
      message.includes('API key') ||
      message.includes('Authorization')
        ? 401
        : message.includes('Invalid JSON')
          ? 400
          : 500;

    sendJson(res, statusCode, {
      error: message,
    });
  }
}

export function createMcpServer(
  config: EnvConfig,
  services: ServiceContainer,
): McpServerInstance {
  const server = http.createServer(
    (req, res) => {
      void handleRequest(
        req,
        res,
        services,
      );
    },
  );

  return {
    start(port: number): Promise<void> {
      return new Promise((resolve, reject) => {
        server.listen(
          port,
          '0.0.0.0',
          () => {
            server.ref();

            process.stdout.write(
              `[quill/mcp] MCP server listening on port ${port} (NODE_ENV=${config.NODE_ENV})\n`,
            );

            resolve();
          },
        );

        server.once('error', reject);
      });
    },

    stop(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}