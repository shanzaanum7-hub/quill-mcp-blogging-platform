/**
 * @quill/shared — barrel export
 * Zero runtime dependencies outside Node.js built-ins.
 */

// Errors
export { AppError } from './errors/AppError.js';

// Utilities
export { generateSlug, ensureUniqueSlug } from './utils/slug.js';
export { toISOString, parseISOString, isFuture } from './utils/date.js';
export { loadEnv } from './utils/env.js';
export type { EnvConfig } from './utils/env.js';

// Types
export type { PostStatus, AnalyticsRange } from './types/index.js';

export {
	createApiKeySchema,
	createPostSchema,
	listPostsSchema,
	loginSchema,
	registerSchema,
	schedulePostSchema,
	seoSchema,
	updatePostSchema,
} from './schemas/index.js';
export type {
	CreateApiKeyData,
	CreatePostInput,
	ListPostsInput,
	LoginData,
	RegisterData,
	SchedulePostInput,
	SeoInput,
	UpdatePostInput,
} from './schemas/index.js';
