import type Database from 'better-sqlite3';

export type AnalyticsSummary = {
  total_views: number;
  unique_views: number;
};

export type TopPostRow = {
  post_id: number;
  title: string;
  slug: string;
  total_views: number;
  unique_views: number;
};

export type CreateAnalyticsEventData = {
  post_id?: number | null;
  user_id?: number | null;
  event_type: 'page_view' | 'unique_view';
  ip_hash?: string | null;
  user_agent?: string | null;
  referrer?: string | null;
  created_at?: string;
};

export interface IAnalyticsRepository {
  insert(data: CreateAnalyticsEventData): void;
  countByPost(postId: number, from: string, to: string): AnalyticsSummary;
  countByUser(userId: number, from: string, to: string): AnalyticsSummary;
  topPostsByUser(userId: number, from: string, to: string, limit: number): TopPostRow[];
}

export class AnalyticsRepository implements IAnalyticsRepository {
  constructor(private readonly db: Database.Database) {}

  insert(data: CreateAnalyticsEventData): void {
    this.db
      .prepare(
        `INSERT INTO analytics_events (post_id, user_id, event_type, ip_hash, user_agent, referrer, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.post_id ?? null,
        data.user_id ?? null,
        data.event_type,
        data.ip_hash ?? null,
        data.user_agent ?? null,
        data.referrer ?? null,
        data.created_at ?? new Date().toISOString()
      );
  }

  countByPost(postId: number, from: string, to: string): AnalyticsSummary {
    const result = this.db
      .prepare(
        `SELECT
          SUM(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) AS total_views,
          SUM(CASE WHEN event_type = 'unique_view' THEN 1 ELSE 0 END) AS unique_views
         FROM analytics_events
         WHERE post_id = ? AND created_at >= ? AND created_at <= ?`
      )
      .get(postId, from, to) as { total_views: number | null; unique_views: number | null };

    return {
      total_views: Number(result?.total_views ?? 0),
      unique_views: Number(result?.unique_views ?? 0),
    };
  }

  countByUser(userId: number, from: string, to: string): AnalyticsSummary {
    const result = this.db
      .prepare(
        `SELECT
          SUM(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) AS total_views,
          SUM(CASE WHEN event_type = 'unique_view' THEN 1 ELSE 0 END) AS unique_views
         FROM analytics_events
         WHERE user_id = ? AND created_at >= ? AND created_at <= ?`
      )
      .get(userId, from, to) as { total_views: number | null; unique_views: number | null };

    return {
      total_views: Number(result?.total_views ?? 0),
      unique_views: Number(result?.unique_views ?? 0),
    };
  }

  topPostsByUser(userId: number, from: string, to: string, limit: number): TopPostRow[] {
    return this.db
      .prepare(
        `SELECT
          p.id AS post_id,
          p.title,
          p.slug,
          SUM(CASE WHEN ae.event_type = 'page_view' THEN 1 ELSE 0 END) AS total_views,
          SUM(CASE WHEN ae.event_type = 'unique_view' THEN 1 ELSE 0 END) AS unique_views
         FROM posts p
         LEFT JOIN analytics_events ae ON ae.post_id = p.id
         WHERE p.user_id = ? AND ae.created_at >= ? AND ae.created_at <= ?
         GROUP BY p.id, p.title, p.slug
         ORDER BY total_views DESC, unique_views DESC, p.created_at DESC
         LIMIT ?`
      )
      .all(userId, from, to, limit) as TopPostRow[];
  }
}
