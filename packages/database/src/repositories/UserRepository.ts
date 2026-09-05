import Database from 'better-sqlite3';

export type UserRow = {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateUserData = {
  username: string;
  email: string;
  password_hash: string;
  display_name?: string;
  bio?: string;
};

export type UpdateUserData = {
  display_name?: string;
  bio?: string;
  password_hash?: string;
  updated_at: string;
};

export interface IUserRepository {
  findById(id: number): UserRow | undefined;
  findByEmail(email: string): UserRow | undefined;
  findByUsername(username: string): UserRow | undefined;
  create(data: CreateUserData): UserRow;
  update(id: number, data: Partial<UpdateUserData>): UserRow | undefined;
  delete(id: number): boolean;
}

export class UserRepository implements IUserRepository {
  constructor(private readonly db: Database.Database) {}

  findById(id: number): UserRow | undefined {
    return this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(id) as UserRow | undefined;
  }

  findByEmail(email: string): UserRow | undefined {
    return this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(email) as UserRow | undefined;
  }

  findByUsername(username: string): UserRow | undefined {
    return this.db
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(username) as UserRow | undefined;
  }

  create(data: CreateUserData): UserRow {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO users (username, email, password_hash, display_name, bio, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.username,
        data.email,
        data.password_hash,
        data.display_name ?? null,
        data.bio ?? null,
        now,
        now
      );

    const id = Number(result.lastInsertRowid);
    const created = this.findById(id);
    if (!created) {
      throw new Error('User was not created successfully');
    }

    return created;
  }

  update(id: number, data: Partial<UpdateUserData>): UserRow | undefined {
    const fields: string[] = [];
    const values: Array<string | number | null> = [];

    if (data.display_name !== undefined) {
      fields.push('display_name = ?');
      values.push(data.display_name ?? null);
    }

    if (data.bio !== undefined) {
      fields.push('bio = ?');
      values.push(data.bio ?? null);
    }

    if (data.password_hash !== undefined) {
      fields.push('password_hash = ?');
      values.push(data.password_hash);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    const updatedAt = data.updated_at ?? new Date().toISOString();
    fields.push('updated_at = ?');
    values.push(updatedAt, id);

    this.db
      .prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values);

    return this.findById(id);
  }

  delete(id: number): boolean {
    const result = this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return Number(result.changes) > 0;
  }
}
