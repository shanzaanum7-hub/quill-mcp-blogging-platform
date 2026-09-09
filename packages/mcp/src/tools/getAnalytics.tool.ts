import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ServiceContainer } from '@quill/services';
import { toolError } from './createPost.tool.js';

const inputSchema = {
  range: z
    .enum(['7d', '30d', '90d', 'all'])
    .default('30d')
    .describe('Analytics time range (default: 30d)'),

  post_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Optional post ID. If provided, returns analytics for that post. Otherwise returns account-level analytics.',
    ),
};

export function registerGetAnalyticsTool(
  mcpServer: McpServer,
  services: ServiceContainer,
  getUserId: () => number,
): void {
  mcpServer.tool(
    'get_analytics',
    'Returns analytics for the authenticated user. Provide post_id for a specific post, or omit it for account-level analytics. Supported ranges: 7d, 30d, 90d, all.',
    inputSchema,
    (args): CallToolResult => {
      try {
        const userId = getUserId();

        const result =
          args.post_id !== undefined
            ? services.analyticsService.getPostAnalytics(
                userId,
                args.post_id,
                args.range,
              )
            : services.analyticsService.getAccountAnalytics(
                userId,
                args.range,
              );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );
}