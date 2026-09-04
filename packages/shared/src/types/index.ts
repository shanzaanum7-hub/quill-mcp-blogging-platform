/**
 * Shared TypeScript types derived from Zod schemas.
 * Populated as schemas are added in subsequent specs.
 */

export type PostStatus = 'draft' | 'published' | 'scheduled';

export type AnalyticsRange = '7d' | '30d' | '90d' | 'all';
