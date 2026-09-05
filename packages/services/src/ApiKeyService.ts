import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError } from '@quill/shared';
import type { IApiKeyRepository } from '@quill/database';

export type CreateKeyResult = {
  id: number;
  name: string;
  key_prefix: string;
  raw_key: string;
  created_at: string;
};

export type ApiKeyPublic = {
  id: number;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  revoked: boolean;
  created_at: string;
};

export class ApiKeyService {
  constructor(private readonly keys: IApiKeyRepository) {}

  createKey(userId: number, name: string): CreateKeyResult {
    const rawKey = `quill_${randomBytes(32).toString('base64url')}`;
    const row = this.keys.create({
      user_id: userId,
      name,
      key_hash: this.hash(rawKey),
      key_prefix: rawKey.slice(0, 8),
    });
    return {
      id: row.id,
      name: row.name,
      key_prefix: row.key_prefix,
      raw_key: rawKey,
      created_at: row.created_at,
    };
  }

  listKeys(userId: number): ApiKeyPublic[] {
    return this.keys.findAllByUser(userId).map((key) => ({
      id: key.id,
      name: key.name,
      key_prefix: key.key_prefix,
      last_used_at: key.last_used_at,
      revoked: key.revoked === 1,
      created_at: key.created_at,
    }));
  }

  revokeKey(userId: number, keyId: number): void {
    const key = this.keys.findById(keyId);
    if (!key) {
      throw new AppError('KEY_NOT_FOUND', 'API key not found', 404);
    }
    if (key.user_id !== userId) {
      throw new AppError('FORBIDDEN', 'You do not own this API key', 403);
    }
    this.keys.revoke(keyId);
  }

  verifyKey(rawKey: string): { userId: number } {
    const key = this.keys.findByHash(this.hash(rawKey));
    if (key) {
      this.keys.updateLastUsed(key.id, new Date().toISOString());
    }
    if (!key || !this.hashMatches(rawKey, key.key_hash) || key.revoked === 1) {
      throw new AppError('INVALID_API_KEY', 'Invalid API key', 401);
    }
    return { userId: key.user_id };
  }

  private hash(rawKey: string): string {
    return createHash('sha256').update(rawKey).digest('hex');
  }

  private hashMatches(rawKey: string, storedHash: string): boolean {
    const input = Buffer.from(this.hash(rawKey), 'hex');
    const stored = Buffer.from(storedHash, 'hex');
    return input.length === stored.length && timingSafeEqual(input, stored);
  }
}