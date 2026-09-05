import { describe, expect, it } from 'vitest';

import { createDatabaseClient } from './client.js';
import { runMigrations } from './migrations/runner.js';
import { ApiKeyRepository } from './repositories/ApiKeyRepository.js';
import { AnalyticsRepository } from './repositories/AnalyticsRepository.js';
import { PostRepository } from './repositories/PostRepository.js';
import { UserRepository } from './repositories/UserRepository.js';

function createTestDatabase() {
  const db = createDatabaseClient(':memory:');
  runMigrations(db);
  return db;
}

describe('database migration runner', () => {
  it('creates the schema and records migrations', () => {
    const db = createTestDatabase();

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as Array<{ name: string }>;

    expect(tables.map((table) => table.name)).toEqual(
      expect.arrayContaining(['schema_migrations', 'users', 'api_keys', 'posts', 'analytics_events'])
    );

    const migrationRows = db
      .prepare('SELECT filename FROM schema_migrations ORDER BY id')
      .all() as Array<{ filename: string }>;

    expect(migrationRows.some((row) => row.filename === '001_initial_schema.up.sql')).toBe(true);
  });

  it('is idempotent on a second run', () => {
    const db = createTestDatabase();
    runMigrations(db);

    const rows = db
      .prepare('SELECT filename FROM schema_migrations WHERE filename = ?')
      .all('001_initial_schema.up.sql') as Array<{ filename: string }>;

    expect(rows).toHaveLength(1);
  });
});

describe('user repository', () => {
  it('creates and retrieves a user by email', () => {
    const db = createTestDatabase();
    const userRepository = new UserRepository(db);

    const user = userRepository.create({
      username: 'alice',
      email: 'alice@example.com',
      password_hash: 'hashed-password',
      display_name: 'Alice',
      bio: 'Writer',
    });

    expect(user.id).toBeGreaterThan(0);
    expect(userRepository.findByEmail('alice@example.com')).toMatchObject({
      id: user.id,
      username: 'alice',
    });
    expect(userRepository.findByUsername('ALICE')).toMatchObject({ id: user.id });
    expect(userRepository.findById(user.id)).toMatchObject({ email: 'alice@example.com' });
  });
});

describe('post repository', () => {
  it('creates and paginates posts for a user and finds published content', () => {
    const db = createTestDatabase();
    const userRepository = new UserRepository(db);
    const postRepository = new PostRepository(db);

    const user = userRepository.create({
      username: 'writer',
      email: 'writer@example.com',
      password_hash: 'pw',
    });

    const draft = postRepository.create({
      user_id: user.id,
      title: 'Draft Post',
      slug: 'draft-post',
      content: 'draft',
      status: 'draft',
    });

    const published = postRepository.create({
      user_id: user.id,
      title: 'Published Post',
      slug: 'published-post',
      content: 'published',
      status: 'published',
      published_at: '2026-09-01T10:00:00.000Z',
    });

    const scheduled = postRepository.create({
      user_id: user.id,
      title: 'Scheduled Post',
      slug: 'scheduled-post',
      content: 'scheduled',
      status: 'scheduled',
      scheduled_for: '2026-09-04T12:00:00.000Z',
    });

    expect(postRepository.findById(draft.id)).toMatchObject({ title: 'Draft Post' });
    expect(postRepository.findBySlug(user.id, 'published-post')).toMatchObject({ id: published.id });
    expect(postRepository.findAllByUser(user.id, { status: 'published', page: 1, limit: 10 })).toHaveLength(1);
    expect(postRepository.findPublishedByUsername('writer', 1, 10)).toHaveLength(1);
    expect(postRepository.findPublishedBySlug('writer', 'published-post')).toMatchObject({ id: published.id });
    expect(postRepository.findScheduledDue()).toHaveLength(1);
    expect(postRepository.slugExistsForUser(user.id, 'published-post')).toBe(true);
    expect(postRepository.slugExistsForUser(user.id, 'missing-slug')).toBe(false);
    expect(postRepository.findAllByUser(user.id, { page: 1, limit: 2 })).toHaveLength(2);
    expect(postRepository.countByUser(user.id, { status: 'published' })).toBe(1);
    expect(postRepository.countByUser(user.id, { status: 'scheduled' })).toBe(1);
    expect(postRepository.findScheduledDue()[0]?.id).toBe(scheduled.id);
  });
});

describe('api key repository', () => {
  it('creates, finds by hash, and revokes keys', () => {
    const db = createTestDatabase();
    const userRepo = new UserRepository(db);
    const apiKeyRepo = new ApiKeyRepository(db);

    const user = userRepo.create({
      username: 'key-user',
      email: 'key-user@example.com',
      password_hash: 'pw',
    });

    const created = apiKeyRepo.create({
      user_id: user.id,
      name: 'Primary',
      key_hash: 'hash-123',
      key_prefix: 'kh_123',
    });

    expect(apiKeyRepo.findByHash('hash-123')).toMatchObject({ id: created.id });
    expect(apiKeyRepo.findAllByUser(user.id)).toHaveLength(1);
    expect(apiKeyRepo.revoke(created.id)).toBe(true);
    expect(apiKeyRepo.findById(created.id)).toMatchObject({ revoked: 1 });
  });
});

describe('analytics repository', () => {
  it('records analytics and summarizes totals by post and user', () => {
    const db = createTestDatabase();
    const userRepo = new UserRepository(db);
    const postRepo = new PostRepository(db);
    const analyticsRepo = new AnalyticsRepository(db);

    const user = userRepo.create({
      username: 'analytics-user',
      email: 'analytics-user@example.com',
      password_hash: 'pw',
    });

    const post = postRepo.create({
      user_id: user.id,
      title: 'Analytics Post',
      slug: 'analytics-post',
      content: 'content',
      status: 'published',
    });

    analyticsRepo.insert({
      post_id: post.id,
      user_id: user.id,
      event_type: 'page_view',
      ip_hash: 'ip1',
      user_agent: 'ua1',
      referrer: 'https://example.com',
    });

    analyticsRepo.insert({
      post_id: post.id,
      user_id: user.id,
      event_type: 'page_view',
      ip_hash: 'ip2',
      user_agent: 'ua2',
      referrer: 'https://example.com',
    });

    analyticsRepo.insert({
      post_id: post.id,
      user_id: user.id,
      event_type: 'unique_view',
      ip_hash: 'ip3',
      user_agent: 'ua3',
      referrer: 'https://example.com',
    });

    expect(
      analyticsRepo.countByPost(post.id, '2025-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z')
    ).toEqual({ total_views: 2, unique_views: 1 });

    expect(
      analyticsRepo.countByUser(user.id, '2025-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z')
    ).toEqual({ total_views: 2, unique_views: 1 });

    expect(
      analyticsRepo.topPostsByUser(user.id, '2025-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z', 10)
    ).toEqual([
      expect.objectContaining({
        post_id: post.id,
        title: 'Analytics Post',
        slug: 'analytics-post',
        total_views: 2,
        unique_views: 1,
      }),
    ]);
  });
});

describe('database integrity', () => {
  it('enables WAL mode and foreign keys', () => {
    const filePath = 'tmp-db-wal-check.db';
    const db = createDatabaseClient(filePath);

    try {
      const journalMode = db.pragma('journal_mode');
      const foreignKeys = db.pragma('foreign_keys');

      expect(Array.isArray(journalMode) ? journalMode[0]?.journal_mode : journalMode).toBe('wal');
      expect(Array.isArray(foreignKeys) ? foreignKeys[0]?.foreign_keys : foreignKeys).toBe(1);
    } finally {
      db.close();
      // SQLite file cleanup for the WAL validation test.
      const fs = require('node:fs');
      try {
        fs.rmSync(filePath, { force: true });
      } catch {
        // no-op cleanup
      }
    }
  });

  it('cascades child rows when a user is deleted and rejects orphan inserts', () => {
    const db = createTestDatabase();
    const userRepository = new UserRepository(db);
    const postRepository = new PostRepository(db);
    const apiKeyRepository = new ApiKeyRepository(db);

    const user = userRepository.create({
      username: 'cascade-user',
      email: 'cascade-user@example.com',
      password_hash: 'pw',
    });

    const post = postRepository.create({
      user_id: user.id,
      title: 'Cascade Post',
      slug: 'cascade-post',
      content: 'content',
      status: 'draft',
    });

    const key = apiKeyRepository.create({
      user_id: user.id,
      name: 'Cascade Key',
      key_hash: 'cascade-hash',
      key_prefix: 'ck',
    });

    expect(userRepository.delete(user.id)).toBe(true);
    expect(postRepository.findById(post.id)).toBeUndefined();
    expect(apiKeyRepository.findById(key.id)).toBeUndefined();

    expect(() => {
      db.prepare('INSERT INTO posts (user_id, title, slug, content, status) VALUES (999, ?, ?, ?, ?)').run(
        'Broken post',
        'broken-post',
        'content',
        'draft'
      );
    }).toThrow(/FOREIGN KEY|constraint/i);
  });
});
