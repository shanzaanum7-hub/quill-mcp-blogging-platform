import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { PostRepository, runMigrations, UserRepository } from '@quill/database';
import { PostService } from './PostService.js';

describe('PostService', () => {
  let service: PostService;
  let db: Database.Database;
  let ownerId: number;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    const user = new UserRepository(db).create({ username: 'alice', email: 'alice@example.com', password_hash: 'hash' });
    ownerId = user.id;
    service = new PostService(new PostRepository(db), new UserRepository(db));
  });

  it('creates drafts with unique slugs', () => {
    const first = service.createPost(ownerId, { title: 'Same title', content: 'one' });
    const second = service.createPost(ownerId, { title: 'Same title', content: 'two' });
    expect(first).toMatchObject({ status: 'draft', slug: 'same-title' });
    expect(second.slug).toBe('same-title-2');
  });

  it('enforces ownership and lifecycle transitions', () => {
    const post = service.createPost(ownerId, { title: 'Post', content: 'body' });
    expect(() => service.getPost(ownerId + 1, post.id)).toThrowError('Access denied');
    expect(service.publishPost(ownerId, post.id).status).toBe('published');
    expect(() => service.publishPost(ownerId, post.id)).toThrowError('Post is already published');
    expect(service.unpublishPost(ownerId, post.id).status).toBe('draft');
  });

  it('rejects schedules in the past', () => {
    const post = service.createPost(ownerId, { title: 'Scheduled', content: 'body' });
    expect(() => service.schedulePost(ownerId, post.id, '2020-01-01T00:00:00.000Z')).toThrowError('Scheduled time must be in the future');
  });
});