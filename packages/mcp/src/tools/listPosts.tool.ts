/**
 * MCP tool: list_posts
 *
 * Lists the authenticated user's own posts, optionally filtered by status.
 * Delegates entirely to PostService.listPosts — no business logic here.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServiceContainer } from '@quill/services';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { toolError } from './createPost.tool.js';

const inputSchema = {
  status: z
    .enum(['draft', 'published', 'scheduled'])
    .optional()
    .describe('Filter by post status. Omit to return all statuses.'),
  page: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe('Page number, starting at 1 (default: 1)'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe('Number of results per page, max 100 (default: 20)'),
};

export function registerListPostsTool(
  mcpServer: McpServer,
  services: ServiceContainer,
  getUserId: () => number,
): void {
  mcpServer.tool(
    'list_posts',
    'Lists blog posts belonging to the authenticated user. Results include post summaries (no full content body) with pagination metadata. Filter by status to narrow results.',
    inputSchema,
    (args): CallToolResult => {
      try {
        const result = services.postService.listPosts(getUserId(), {
          status: args.status,
          page: args.page,
          limit: args.limit,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
