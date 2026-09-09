import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { AnalyticsRepository, PostRepository, runMigrations, UserRepository } from '@quill/database';
import { AnalyticsService } from './AnalyticsService.js';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let db: Database.Database;
  let userRepo: UserRepository;
  let postRepo: PostRepository;
  let analyticsRepo: AnalyticsRepository;
  let userId: number;
  let otherUserId: number;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    userRepo = new UserRepository(db);
    postRepo = new PostRepository(db);
    analyticsRepo = new AnalyticsRepository(db);
    service = new AnalyticsService(analyticsRepo, postRepo);

    const user = userRepo.create({ username: 'author', email: 'author@example.com', password_hash: 'hash' });
    userId = user.id;

    const otherUser = userRepo.create({ username: 'other', email: 'other@example.com', password_hash: 'hash' });
    otherUserId = otherUser.id;
  });

  it('records a public view event for a published post', () => {
    const post = postRepo.create({
      user_id: userId,
      title: 'Published Post',
      slug: 'published-post',
      content: 'Hello World',
      status: 'published',
    });

    service.recordPublicView('author', 'published-post', {
      referrer: 'https://example.com',
      userAgent: 'test-agent',
    });

    const analytics = service.getPostAnalytics(userId, post.id, '30d');
    expect(analytics).toMatchObject({
      post_id: post.id,
      title: 'Published Post',
      slug: 'published-post',
      total_views: 1,
      unique_views: 0,
      range: '30d',
    });
  });

  it('does not record a view for draft or nonexistent posts', () => {
    const draft = postRepo.create({
      user_id: userId,
      title: 'Draft Post',
      slug: 'draft-post',
      content: 'Draft content',
      status: 'draft',
    });

    service.recordPublicView('author', 'draft-post');
    service.recordPublicView('author', 'nonexistent-post');

    const analytics = service.getPostAnalytics(userId, draft.id, '30d');
    expect(analytics.total_views).toBe(0);
  });

  it('retrieves post analytics across all range options including all-time', () => {
    const post = postRepo.create({
      user_id: userId,
      title: 'Historical Post',
      slug: 'historical-post',
      content: 'Content',
      status: 'published',
    });

    // Insert an event from 100 days ago
    const oldDate = new Date();
    oldDate.setUTCDate(oldDate.getUTCDate() - 100);
    analyticsRepo.insert({
      post_id: post.id,
      user_id: userId,
      event_type: 'page_view',
      created_at: oldDate.toISOString(),
    });

    // Insert a recent event
    service.recordPublicView('author', 'historical-post');

    // 7d should only see the recent view
    expect(service.getPostAnalytics(userId, post.id, '7d').total_views).toBe(1);
    // 30d should only see the recent view
    expect(service.getPostAnalytics(userId, post.id, '30d').total_views).toBe(1);
    // all should see both views
    expect(service.getPostAnalytics(userId, post.id, 'all').total_views).toBe(2);
  });

  it('enforces post ownership and existence for post analytics', () => {
    const post = postRepo.create({
      user_id: userId,
      title: 'Protected Post',
      slug: 'protected-post',
      content: 'Content',
      status: 'published',
    });

    expect(() => service.getPostAnalytics(otherUserId, post.id, '30d')).toThrowError('Access denied');
    expect(() => service.getPostAnalytics(userId, 9999, '30d')).toThrowError('Post not found');
  });

  it('retrieves account-level analytics with top posts', () => {
    const post = postRepo.create({
      user_id: userId,
      title: 'Top Post',
      slug: 'top-post',
      content: 'Content',
      status: 'published',
    });

    service.recordPublicView('author', 'top-post');

    const accountAnalytics = service.getAccountAnalytics(userId, 'all');
    expect(accountAnalytics.total_views).toBe(1);
    expect(accountAnalytics.top_posts).toHaveLength(1);
    expect(accountAnalytics.top_posts[0]?.post_id).toBe(post.id);
  });
});
