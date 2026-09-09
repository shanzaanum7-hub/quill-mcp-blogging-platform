import Database from 'better-sqlite3';
import type { IncomingMessage } from 'node:http';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiKeyRepository, runMigrations, UserRepository } from '@quill/database';
import { ApiKeyService } from '@quill/services';
import { AppError } from '@quill/shared';
import { verifyRequestApiKey } from './apiKeyMiddleware.js';

function createMockRequest(headers: Record<string, string | undefined>): IncomingMessage {
  return {
    headers,
  } as unknown as IncomingMessage;
}

describe('MCP apiKeyMiddleware', () => {
  let db: Database.Database;
  let apiKeyService: ApiKeyService;
  let userId: number;
  let validRawKey: string;
  let keyId: number;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    const userRepo = new UserRepository(db);
    const user = userRepo.create({
      username: 'testuser',
      email: 'testuser@example.com',
      password_hash: 'hash123',
    });
    userId = user.id;

    apiKeyService = new ApiKeyService(new ApiKeyRepository(db));
    const created = apiKeyService.createKey(userId, 'Test MCP Key');
    validRawKey = created.raw_key;
    keyId = created.id;
  });

  it('succeeds with a valid Bearer token and returns the correct userId', () => {
    const req = createMockRequest({
      authorization: `Bearer ${validRawKey}`,
    });

    const result = verifyRequestApiKey(req, apiKeyService);
    expect(result).toEqual({ userId });
  });

  it('rejects when Authorization header is missing', () => {
    const req = createMockRequest({});

    expect(() => verifyRequestApiKey(req, apiKeyService)).toThrowError(AppError);
    try {
      verifyRequestApiKey(req, apiKeyService);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.code).toBe('INVALID_API_KEY');
      expect(appErr.statusCode).toBe(401);
    }
  });

  it('rejects when Authorization header does not use Bearer scheme', () => {
    const req = createMockRequest({
      authorization: `Basic ${validRawKey}`,
    });

    expect(() => verifyRequestApiKey(req, apiKeyService)).toThrowError(AppError);
    try {
      verifyRequestApiKey(req, apiKeyService);
    } catch (err) {
      const appErr = err as AppError;
      expect(appErr.code).toBe('INVALID_API_KEY');
      expect(appErr.statusCode).toBe(401);
    }
  });

  it('rejects when Bearer token is empty or whitespace only', () => {
    const reqEmpty = createMockRequest({ authorization: 'Bearer ' });
    const reqSpaces = createMockRequest({ authorization: 'Bearer    ' });

    expect(() => verifyRequestApiKey(reqEmpty, apiKeyService)).toThrowError(AppError);
    expect(() => verifyRequestApiKey(reqSpaces, apiKeyService)).toThrowError(AppError);
  });

  it('rejects an invalid or unrecognized API key', () => {
    const req = createMockRequest({
      authorization: 'Bearer quill_invalidkey123456789012345678901234567890',
    });

    expect(() => verifyRequestApiKey(req, apiKeyService)).toThrowError(AppError);
    try {
      verifyRequestApiKey(req, apiKeyService);
    } catch (err) {
      const appErr = err as AppError;
      expect(appErr.code).toBe('INVALID_API_KEY');
      expect(appErr.statusCode).toBe(401);
    }
  });

  it('rejects a revoked API key', () => {
    apiKeyService.revokeKey(userId, keyId);

    const req = createMockRequest({
      authorization: `Bearer ${validRawKey}`,
    });

    expect(() => verifyRequestApiKey(req, apiKeyService)).toThrowError(AppError);
    try {
      verifyRequestApiKey(req, apiKeyService);
    } catch (err) {
      const appErr = err as AppError;
      expect(appErr.code).toBe('INVALID_API_KEY');
      expect(appErr.statusCode).toBe(401);
    }
  });
});
