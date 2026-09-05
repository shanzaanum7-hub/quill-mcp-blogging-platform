import Database from 'better-sqlite3';

export type ApiKeyRow = {
  id: number;
  user_id: number;
  name: string;
  key_hash: string;
  key_prefix: string;
  last_used_at: string | null;
  revoked: number;
  created_at: string;
};

export type CreateApiKeyData = {
  user_id: number;
  name: string;
  key_hash: string;
  key_prefix: string;
  last_used_at?: string;
  revoked?: number;
};

export interface IApiKeyRepository {
  findById(id: number): ApiKeyRow | undefined;
  findByHash(keyHash: string): ApiKeyRow | undefined;
  findAllByUser(userId: number): ApiKeyRow[];
  create(data: CreateApiKeyData): ApiKeyRow;
  updateLastUsed(id: number, lastUsedAt: string): void;
  revoke(id: number): boolean;
}

export class ApiKeyRepository implements IApiKeyRepository {
  constructor(private readonly db: Database.Database) {}

  findById(id: number): ApiKeyRow | undefined {
    return this.db
      .prepare('SELECT * FROM api_keys WHERE id = ?')
      .get(id) as ApiKeyRow | undefined;
  }

  findByHash(keyHash: string): ApiKeyRow | undefined {
    return this.db
      .prepare('SELECT * FROM api_keys WHERE key_hash = ?')
      .get(keyHash) as ApiKeyRow | undefined;
  }

  findAllByUser(userId: number): ApiKeyRow[] {
    return this.db
      .prepare('SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as ApiKeyRow[];
  }

  create(data: CreateApiKeyData): ApiKeyRow {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO api_keys (user_id, name, key_hash, key_prefix, last_used_at, revoked, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.user_id,
        data.name,
        data.key_hash,
        data.key_prefix,
        data.last_used_at ?? null,
        data.revoked ?? 0,
        now
      );

    const created = this.findById(Number(result.lastInsertRowid));
    if (!created) {
      throw new Error('API key was not created successfully');
    }

    return created;
  }

  updateLastUsed(id: number, lastUsedAt: string): void {
    this.db
      .prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?')
      .run(lastUsedAt, id);
  }

  revoke(id: number): boolean {
    const result = this.db
      .prepare('UPDATE api_keys SET revoked = 1 WHERE id = ?')
      .run(id);

    return Number(result.changes) > 0;
  }
}
