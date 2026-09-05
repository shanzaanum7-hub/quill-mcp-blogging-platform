import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type Database from 'better-sqlite3';

import { createDatabaseClient } from '../client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATION_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    filename   TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

export function runMigrations(db: Database.Database): void {
  db.exec(MIGRATION_TABLE_SQL);

  const migrationDir = __dirname;
  const files = readdirSync(migrationDir)
    .filter((file) => file.endsWith('.up.sql'))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const existing = db
      .prepare('SELECT 1 FROM schema_migrations WHERE filename = ?')
      .get(file) as { 1: number } | undefined;

    if (existing) {
      continue;
    }

    const filePath = path.join(migrationDir, file);
    const sql = readFileSync(filePath, 'utf8');

    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)').run(file);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${file} failed: ${detail}`);
    }
  }
}

export function rollbackMigration(db: Database.Database, filename: string): void {
  const downFile = path.join(__dirname, filename.replace(/\.up\.sql$/, '.down.sql'));

  if (!downFile.endsWith('.down.sql')) {
    throw new Error(`Invalid migration name for rollback: ${filename}`);
  }

  const sql = readFileSync(downFile, 'utf8');
  db.exec(sql);
  db.prepare('DELETE FROM schema_migrations WHERE filename = ?').run(filename);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const databasePath = process.env.DATABASE_PATH ?? path.resolve(process.cwd(), 'quill.db');
  const db = createDatabaseClient(databasePath);
  runMigrations(db);
  console.warn(`Database migrations applied to ${databasePath}`);
}
