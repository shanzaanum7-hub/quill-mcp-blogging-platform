/**
 * MCP tool: publish_post
 *
 * Immediately publishes a draft or scheduled post, making it publicly visible.
 * Delegates entirely to PostService.publishPost — ownership check and state
 * transition validation happen there.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServiceContainer } from '@quill/services';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { toolError } from './createPost.tool.js';

const inputSchema = {
  post_id: z
    .number()
    .int()
    .positive()
    .describe('The numeric ID of the post to publish'),
};

export function registerPublishPostTool(
  mcpServer: McpServer,
  services: ServiceContainer,
  getUserId: () => number,
): void {
  mcpServer.tool(
    'publish_post',
    'Immediately publishes a blog post, making it publicly visible on the blog. Sets the status to "published" and records the published_at timestamp. Returns an error if the post is already published or does not belong to the authenticated user.',
    inputSchema,
    (args): CallToolResult => {
      try {
        const post = services.postService.publishPost(getUserId(), args.post_id);
        return {
          content: [{ type: 'text', text: JSON.stringify(post, null, 2) }],
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
