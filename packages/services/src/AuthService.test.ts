import Database from 'better-sqlite3';
import argon2 from 'argon2';
import { beforeEach, describe, expect, it } from 'vitest';
import { runMigrations, UserRepository } from '@quill/database';
import { AuthService } from './AuthService.js';

describe('AuthService', () => {
  let service: AuthService;
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    service = new AuthService(new UserRepository(db));
  });

  async function capture(promise: Promise<unknown>): Promise<unknown> {
    try {
      return await promise;
    } catch (error: unknown) {
      return error;
    }
  }

  it('registers users with an Argon2id hash and no password in the result', async () => {
    const user = await service.register({ username: 'alice', email: 'alice@example.com', password: 'password123' });
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash: string };
    expect(row.password_hash).not.toBe('password123');
    expect(row.password_hash).toContain('$argon2id$');
    expect(user).not.toHaveProperty('password_hash');
    expect(await argon2.verify(row.password_hash, 'password123')).toBe(true);
  });

  it('rejects duplicate email and username', async () => {
    await service.register({ username: 'alice', email: 'alice@example.com', password: 'password123' });
    await expect(service.register({ username: 'other', email: 'alice@example.com', password: 'password123' }))
      .rejects.toMatchObject({ code: 'EMAIL_TAKEN', statusCode: 409 });
    await expect(service.register({ username: 'alice', email: 'other@example.com', password: 'password123' }))
      .rejects.toMatchObject({ code: 'USERNAME_TAKEN', statusCode: 409 });
  });

  it('uses the same error for wrong passwords and unknown emails', async () => {
    await service.register({ username: 'alice', email: 'alice@example.com', password: 'password123' });
    const wrong = await capture(service.login({ email: 'alice@example.com', password: 'wrongpass' }));
    const missing = await capture(service.login({ email: 'missing@example.com', password: 'wrongpass' }));
    expect(wrong).toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401, message: 'Invalid email or password' });
    expect(missing).toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401, message: 'Invalid email or password' });
  });
});