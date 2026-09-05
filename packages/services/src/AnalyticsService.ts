import { AppError, type AnalyticsRange } from '@quill/shared';
import type { IAnalyticsRepository, IPostRepository } from '@quill/database';

export type AccountAnalyticsResult = { total_views: number; unique_views: number; top_posts: Array<{ post_id: number; title: string; slug: string; total_views: number; unique_views: number }>; range: AnalyticsRange };
export type PostAnalyticsResult = { post_id: number; title: string; slug: string; total_views: number; unique_views: number; range: AnalyticsRange };

export class AnalyticsService {
  constructor(private readonly analytics: IAnalyticsRepository, private readonly posts: IPostRepository) {}

  getAccountAnalytics(userId: number, range: AnalyticsRange): AccountAnalyticsResult {
    const bounds = this.bounds(range);
    return { ...this.analytics.countByUser(userId, bounds.from, bounds.to), top_posts: this.analytics.topPostsByUser(userId, bounds.from, bounds.to, 10), range };
  }

  getPostAnalytics(userId: number, postId: number, range: AnalyticsRange): PostAnalyticsResult {
    const post = this.posts.findById(postId);
    if (!post) throw new AppError('POST_NOT_FOUND', 'Post not found', 404);
    if (post.user_id !== userId) throw new AppError('FORBIDDEN', 'Access denied', 403);
    const bounds = this.bounds(range);
    return { post_id: post.id, title: post.title, slug: post.slug, ...this.analytics.countByPost(postId, bounds.from, bounds.to), range };
  }

  private bounds(range: AnalyticsRange): { from: string; to: string } {
    const to = new Date();
    const from = new Date(to);
    if (range !== 'all') from.setUTCDate(from.getUTCDate() - ({ '7d': 7, '30d': 30, '90d': 90 }[range] ?? 30));
    return { from: from.toISOString(), to: to.toISOString() };
  }
}