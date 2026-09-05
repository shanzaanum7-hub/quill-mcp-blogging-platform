import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiKeyRepository, runMigrations, UserRepository } from '@quill/database';
import { ApiKeyService } from './ApiKeyService.js';

describe('ApiKeyService', () => {
  let service: ApiKeyService;
  let db: Database.Database;
  let userId: number;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    const user = new UserRepository(db).create({ username: 'alice', email: 'alice@example.com', password_hash: 'hash' });
    userId = user.id;
    service = new ApiKeyService(new ApiKeyRepository(db));
  });

  it('returns a raw key once and stores only its hash', () => {
    const created = service.createKey(userId, 'Cursor');
    const row = db.prepare('SELECT key_hash, key_prefix FROM api_keys WHERE id = ?').get(created.id) as { key_hash: string; key_prefix: string };
    expect(created.raw_key).toMatch(/^quill_[A-Za-z0-9_-]{43}$/);
    expect(row.key_hash).not.toContain(created.raw_key);
    expect(created.key_prefix).toBe(created.raw_key.slice(0, 8));
    expect(service.listKeys(userId)[0]).not.toHaveProperty('raw_key');
  });

  it('verifies and revokes keys', () => {
    const created = service.createKey(userId, 'Cursor');
    expect(service.verifyKey(created.raw_key)).toEqual({ userId });
    service.revokeKey(userId, created.id);
    expect(() => service.verifyKey(created.raw_key)).toThrowError('Invalid API key');
    expect((db.prepare('SELECT last_used_at FROM api_keys WHERE id = ?').get(created.id) as { last_used_at: string | null }).last_used_at).not.toBeNull();
  });

  it('prevents another user from revoking a key', () => {
    const created = service.createKey(userId, 'Cursor');
    expect(() => service.revokeKey(userId + 1, created.id)).toThrowError('You do not own this API key');
  });
});