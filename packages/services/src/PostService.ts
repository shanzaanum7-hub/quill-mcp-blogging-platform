import { AppError, createPostSchema, ensureUniqueSlug, generateSlug, isFuture, listPostsSchema, parseISOString, schedulePostSchema, seoSchema, updatePostSchema } from '@quill/shared';
import { ZodError } from 'zod';
import type { CreatePostData, IPostRepository, IUserRepository, PostRow } from '@quill/database';
import type { CreatePostInput, ListPostsInput, SeoInput, UpdatePostInput } from '@quill/shared';

export type PostSummary = Omit<PostRow, 'user_id' | 'content' | 'seo_title' | 'seo_description' | 'seo_keywords' | 'canonical_url'>;
export type PostFull = Omit<PostRow, 'user_id'>;
export type PostPublic = Pick<PostRow, 'title' | 'slug' | 'excerpt' | 'published_at' | 'content' | 'seo_title' | 'seo_description'>;
export type PaginatedPosts = { posts: PostSummary[]; pagination: { page: number; limit: number; total: number; totalPages: number } };
export type PublicPostsResult = { author: { username: string; display_name: string | null; bio: string | null }; posts: PostPublic[]; pagination: { page: number; limit: number; total: number; totalPages: number } };

export interface IPostService {
  createPost(userId: number, data: CreatePostInput): PostFull;
  updatePost(userId: number, postId: number, data: UpdatePostInput): PostFull;
  deletePost(userId: number, postId: number): void;
  listPosts(userId: number, filters: ListPostsInput): PaginatedPosts;
  getPost(userId: number, postId: number): PostFull;
  publishPost(userId: number, postId: number): PostFull;
  schedulePost(userId: number, postId: number, scheduledFor: string): PostFull;
  unpublishPost(userId: number, postId: number): PostFull;
  manageSeo(userId: number, postId: number, data: SeoInput): PostFull;
  getPublicPosts(username: string, page: number, limit: number): PublicPostsResult;
  getPublicPost(username: string, slug: string): PostPublic;
}

export class PostService implements IPostService {
  constructor(private readonly posts: IPostRepository, private readonly users: IUserRepository) {}

  createPost(userId: number, data: CreatePostInput): PostFull {
    const input = this.validate(() => createPostSchema.parse(data));
    const slug = this.uniqueSlug(userId, generateSlug(input.title));
    const createData: CreatePostData = { user_id: userId, title: input.title, content: input.content, slug, status: 'draft' };
    if (input.excerpt !== undefined) createData.excerpt = input.excerpt;
    return this.full(this.posts.create(createData));
  }

  updatePost(userId: number, postId: number, data: UpdatePostInput): PostFull {
    const post = this.getOwnedPost(userId, postId);
    const input = this.validate(() => updatePostSchema.parse(data));
    const changes: Parameters<IPostRepository['update']>[1] = { updated_at: new Date().toISOString() };
    if (input.title !== undefined) { changes.title = input.title; changes.slug = this.uniqueSlug(userId, generateSlug(input.title), postId); }
    if (input.content !== undefined) changes.content = input.content;
    if (input.excerpt !== undefined) changes.excerpt = input.excerpt;
    return this.full(this.posts.update(post.id, changes) ?? post);
  }

  deletePost(userId: number, postId: number): void {
    this.getOwnedPost(userId, postId);
    this.posts.delete(postId);
  }

  listPosts(userId: number, filters: ListPostsInput): PaginatedPosts {
    const input = this.validate(() => listPostsSchema.parse(filters));
    const postFilters = input.status === undefined
      ? { page: input.page, limit: input.limit }
      : { page: input.page, limit: input.limit, status: input.status };
    const total = this.posts.countByUser(userId, postFilters);
    return { posts: this.posts.findAllByUser(userId, postFilters).map((post) => this.summary(post)), pagination: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) } };
  }

  getPost(userId: number, postId: number): PostFull { return this.full(this.getOwnedPost(userId, postId)); }

  publishPost(userId: number, postId: number): PostFull {
    const post = this.getOwnedPost(userId, postId);
    if (post.status === 'published') throw new AppError('ALREADY_PUBLISHED', 'Post is already published', 409);
    return this.full(this.posts.update(postId, { status: 'published', published_at: new Date().toISOString(), scheduled_for: null, updated_at: new Date().toISOString() }) ?? post);
  }

  schedulePost(userId: number, postId: number, scheduledFor: string): PostFull {
    const post = this.getOwnedPost(userId, postId);
    const input = this.validate(() => schedulePostSchema.parse({ scheduled_for: scheduledFor }));
    const date = parseISOString(input.scheduled_for);
    if (!isFuture(date)) throw new AppError('INVALID_SCHEDULE_TIME', 'Scheduled time must be in the future', 400);
    return this.full(this.posts.update(postId, { status: 'scheduled', scheduled_for: date.toISOString(), published_at: null, updated_at: new Date().toISOString() }) ?? post);
  }

  unpublishPost(userId: number, postId: number): PostFull {
    const post = this.getOwnedPost(userId, postId);
    if (post.status === 'draft') throw new AppError('ALREADY_DRAFT', 'Post is already a draft', 409);
    return this.full(this.posts.update(postId, { status: 'draft', published_at: null, scheduled_for: null, updated_at: new Date().toISOString() }) ?? post);
  }

  manageSeo(userId: number, postId: number, data: SeoInput): PostFull {
    const post = this.getOwnedPost(userId, postId);
    const input = this.validate(() => seoSchema.parse(data));
    const changes: Parameters<IPostRepository['update']>[1] = { updated_at: new Date().toISOString() };
    if (input.seo_title !== undefined) changes.seo_title = input.seo_title;
    if (input.seo_description !== undefined) changes.seo_description = input.seo_description;
    if (input.seo_keywords !== undefined) changes.seo_keywords = input.seo_keywords;
    if (input.canonical_url !== undefined) changes.canonical_url = input.canonical_url;
    return this.full(this.posts.update(postId, changes) ?? post);
  }

  getPublicPosts(username: string, page: number, limit: number): PublicPostsResult {
    const user = this.users.findByUsername(username);
    if (!user) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    const total = this.posts.countPublishedByUsername(username);
    return { author: { username: user.username, display_name: user.display_name, bio: user.bio }, posts: this.posts.findPublishedByUsername(username, page, limit).map((post) => this.public(post)), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  getPublicPost(username: string, slug: string): PostPublic {
    if (!this.users.findByUsername(username)) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    const post = this.posts.findPublishedBySlug(username, slug);
    if (!post) throw new AppError('POST_NOT_FOUND', 'Post not found', 404);
    return this.public(post);
  }

  private getOwnedPost(userId: number, postId: number): PostRow {
    const post = this.posts.findById(postId);
    if (!post) throw new AppError('POST_NOT_FOUND', 'Post not found', 404);
    if (post.user_id !== userId) throw new AppError('FORBIDDEN', 'Access denied', 403);
    return post;
  }

  private uniqueSlug(userId: number, base: string, excludeId?: number): string {
    if (!this.posts.slugExistsForUser(userId, base, excludeId)) return base;
    const existing = this.posts.findAllByUser(userId, {}).map((post) => post.slug);
    return ensureUniqueSlug(base, existing);
  }

  private full(post: PostRow): PostFull { const { user_id: _userId, ...result } = post; return result; }
  private summary(post: PostRow): PostSummary { const { user_id: _userId, content: _content, seo_title: _seoTitle, seo_description: _seoDescription, seo_keywords: _seoKeywords, canonical_url: _canonicalUrl, ...result } = post; return result; }
  private public(post: PostRow): PostPublic { return { title: post.title, slug: post.slug, excerpt: post.excerpt, published_at: post.published_at, content: post.content, seo_title: post.seo_title, seo_description: post.seo_description }; }

  private validate<T>(parse: () => T): T {
    try {
      return parse();
    } catch (error) {
      if (error instanceof ZodError) throw new AppError('VALIDATION_ERROR', 'Invalid request data', 400);
      throw error;
    }
  }
}