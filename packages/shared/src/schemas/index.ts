import { z } from 'zod';

export const registerSchema = z.object({
	username: z.string().regex(/^[a-zA-Z0-9_]+$/, 'Username must be alphanumeric or underscore').min(3).max(30),
	email: z.string().email(),
	password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(1),
});

export const createApiKeySchema = z.object({
	name: z.string().min(1).max(64),
});

export const createPostSchema = z.object({
	title: z.string().min(1).max(200),
	content: z.string().min(1),
	excerpt: z.string().max(500).optional(),
});

export const updatePostSchema = z.object({
	title: z.string().min(1).max(200).optional(),
	content: z.string().min(1).optional(),
	excerpt: z.string().max(500).optional(),
}).refine((data) => Object.keys(data).length > 0, 'At least one field is required');

export const listPostsSchema = z.object({
	status: z.enum(['draft', 'published', 'scheduled']).optional(),
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const schedulePostSchema = z.object({
	scheduled_for: z.string().datetime({ offset: true }),
});

export const seoSchema = z.object({
	seo_title: z.string().max(60).optional(),
	seo_description: z.string().max(160).optional(),
	seo_keywords: z.string().max(200).optional(),
	canonical_url: z.string().url().refine((value) => value.startsWith('https://'), 'Must use HTTPS').optional(),
}).refine((data) => Object.keys(data).length > 0, 'At least one field is required');

export type RegisterData = z.infer<typeof registerSchema>;
export type LoginData = z.infer<typeof loginSchema>;
export type CreateApiKeyData = z.infer<typeof createApiKeySchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type ListPostsInput = z.infer<typeof listPostsSchema>;
export type SchedulePostInput = z.infer<typeof schedulePostSchema>;
export type SeoInput = z.infer<typeof seoSchema>;
