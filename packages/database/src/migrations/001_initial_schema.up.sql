CREATE TABLE IF NOT EXISTS schema_migrations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  filename   TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  display_name  TEXT,
  bio           TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS api_keys (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  key_hash     TEXT    NOT NULL UNIQUE,
  key_prefix   TEXT    NOT NULL,
  last_used_at TEXT,
  revoked      INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0, 1)),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys(key_prefix);

CREATE TABLE IF NOT EXISTS posts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT    NOT NULL,
  slug            TEXT    NOT NULL,
  content         TEXT    NOT NULL DEFAULT '',
  excerpt         TEXT,
  status          TEXT    NOT NULL DEFAULT 'draft'
                          CHECK(status IN ('draft', 'published', 'scheduled')),
  published_at    TEXT,
  scheduled_for   TEXT,
  seo_title       TEXT,
  seo_description TEXT,
  seo_keywords    TEXT,
  canonical_url   TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(user_id, slug);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON posts(scheduled_for) WHERE status = 'scheduled';

CREATE TABLE IF NOT EXISTS analytics_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id     INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_type  TEXT    NOT NULL CHECK(event_type IN ('page_view', 'unique_view')),
  ip_hash     TEXT,
  user_agent  TEXT,
  referrer    TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analytics_post_id ON analytics_events(post_id);
CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(event_type);
