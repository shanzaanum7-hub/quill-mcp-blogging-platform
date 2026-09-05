import type Database from 'better-sqlite3';

export type PostStatus = 'draft' | 'published' | 'scheduled';

export type PostRow = {
  id: number;
  user_id: number;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  status: PostStatus;
  published_at: string | null;
  scheduled_for: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  canonical_url: string | null;
  created_at: string;
  updated_at: string;
};

export type PostFilters = {
  status?: PostStatus;
  page?: number;
  limit?: number;
};

export type CreatePostData = {
  user_id: number;
  title: string;
  slug: string;
  content?: string;
  excerpt?: string;
  status?: PostStatus;
  published_at?: string;
  scheduled_for?: string;
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string;
  canonical_url?: string;
};

export type UpdatePostData = {
  title?: string;
  slug?: string;
  content?: string;
  excerpt?: string;
  status?: PostStatus;
  published_at?: string;
  scheduled_for?: string;
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string;
  canonical_url?: string;
  updated_at: string;
};

export interface IPostRepository {
  findById(id: number): PostRow | undefined;
  findBySlug(userId: number, slug: string): PostRow | undefined;
  findAllByUser(userId: number, filters: PostFilters): PostRow[];
  countByUser(userId: number, filters: PostFilters): number;
  findPublishedByUsername(username: string, page: number, limit: number): PostRow[];
  findPublishedBySlug(username: string, slug: string): PostRow | undefined;
  findScheduledDue(): PostRow[];
  create(data: CreatePostData): PostRow;
  update(id: number, data: Partial<UpdatePostData>): PostRow | undefined;
  delete(id: number): boolean;
  slugExistsForUser(userId: number, slug: string, excludeId?: number): boolean;
}

export class PostRepository implements IPostRepository {
  constructor(private readonly db: Database.Database) {}

  findById(id: number): PostRow | undefined {
    return this.db
      .prepare('SELECT * FROM posts WHERE id = ?')
      .get(id) as PostRow | undefined;
  }

  findBySlug(userId: number, slug: string): PostRow | undefined {
    return this.db
      .prepare('SELECT * FROM posts WHERE user_id = ? AND slug = ?')
      .get(userId, slug) as PostRow | undefined;
  }

  findAllByUser(userId: number, filters: PostFilters): PostRow[] {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;
    const params: Array<number | string> = [userId];

    let query = 'SELECT * FROM posts WHERE user_id = ?';
    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return this.db.prepare(query).all(...params) as PostRow[];
  }

  countByUser(userId: number, filters: PostFilters): number {
    const params: Array<number | string> = [userId];
    let query = 'SELECT COUNT(*) as count FROM posts WHERE user_id = ?';

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    const result = this.db.prepare(query).get(...params) as { count: number };
    return Number(result.count);
  }

  findPublishedByUsername(username: string, page: number, limit: number): PostRow[] {
    const offset = (page - 1) * limit;
    return this.db
      .prepare(
        `SELECT p.*
         FROM posts p
         INNER JOIN users u ON u.id = p.user_id
         WHERE u.username = ? AND p.status = 'published'
         ORDER BY p.published_at DESC, p.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(username, limit, offset) as PostRow[];
  }

  findPublishedBySlug(username: string, slug: string): PostRow | undefined {
    return this.db
      .prepare(
        `SELECT p.*
         FROM posts p
         INNER JOIN users u ON u.id = p.user_id
         WHERE u.username = ? AND p.slug = ? AND p.status = 'published'`
      )
      .get(username, slug) as PostRow | undefined;
  }

  findScheduledDue(): PostRow[] {
    const now = new Date().toISOString();
    return this.db
      .prepare(
        `SELECT *
         FROM posts
         WHERE status = 'scheduled' AND scheduled_for IS NOT NULL AND scheduled_for <= ?
         ORDER BY scheduled_for ASC`
      )
      .all(now) as PostRow[];
  }

  create(data: CreatePostData): PostRow {
    const now = new Date().toISOString();
    const status = data.status ?? 'draft';
    const result = this.db
      .prepare(
        `INSERT INTO posts (
          user_id, title, slug, content, excerpt, status, published_at, scheduled_for,
          seo_title, seo_description, seo_keywords, canonical_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.user_id,
        data.title,
        data.slug,
        data.content ?? '',
        data.excerpt ?? null,
        status,
        data.published_at ?? null,
        data.scheduled_for ?? null,
        data.seo_title ?? null,
        data.seo_description ?? null,
        data.seo_keywords ?? null,
        data.canonical_url ?? null,
        now,
        now
      );

    const created = this.findById(Number(result.lastInsertRowid));
    if (!created) {
      throw new Error('Post was not created successfully');
    }

    return created;
  }

  update(id: number, data: Partial<UpdatePostData>): PostRow | undefined {
    const fields: string[] = [];
    const values: Array<string | number | null> = [];

    for (const [key, value] of Object.entries(data)) {
      if (key === 'updated_at') {
        continue;
      }

      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value as string | number | null);
      }
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    const updatedAt = data.updated_at ?? new Date().toISOString();
    fields.push('updated_at = ?');
    values.push(updatedAt, id);

    this.db
      .prepare(`UPDATE posts SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values);

    return this.findById(id);
  }

  delete(id: number): boolean {
    const result = this.db.prepare('DELETE FROM posts WHERE id = ?').run(id);
    return Number(result.changes) > 0;
  }

  slugExistsForUser(userId: number, slug: string, excludeId?: number): boolean {
    const query = excludeId
      ? 'SELECT 1 FROM posts WHERE user_id = ? AND slug = ? AND id != ? LIMIT 1'
      : 'SELECT 1 FROM posts WHERE user_id = ? AND slug = ? LIMIT 1';

    const params = excludeId ? [userId, slug, excludeId] : [userId, slug];
    return !!this.db.prepare(query).get(...params);
  }
}
