/**
 * MCP tool: create_post
 *
 * Creates a new blog post as a draft for the authenticated user.
 * Delegates entirely to PostService.createPost — no business logic here.
 */
import { z } from 'zod';
import { AppError } from '@quill/shared';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServiceContainer } from '@quill/services';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const inputSchema = {
  title: z.string().min(1).max(200).describe('The post title (1–200 characters)'),
  content: z.string().min(1).describe('The post body in Markdown format'),
  excerpt: z
    .string()
    .max(500)
    .optional()
    .describe('Short summary shown in post listings (max 500 characters, optional)'),
};

export function registerCreatePostTool(
  mcpServer: McpServer,
  services: ServiceContainer,
  getUserId: () => number,
): void {
  mcpServer.tool(
    'create_post',
    'Creates a new blog post as a draft. The post will not be publicly visible until publish_post is called. Returns the full post object including its generated ID and URL slug.',
    inputSchema,
    (args): CallToolResult => {
      try {
        const post = services.postService.createPost(getUserId(), {
          title: args.title,
          content: args.content,
          ...(args.excerpt !== undefined ? { excerpt: args.excerpt } : {}),
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(post, null, 2) }],
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );
}

export function toolError(error: unknown): CallToolResult {
  const message =
    error instanceof AppError
      ? `[${error.code}] ${error.message}`
      : error instanceof Error
        ? error.message
        : 'An unexpected error occurred';
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}
