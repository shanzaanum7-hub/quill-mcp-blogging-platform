import Database from 'better-sqlite3';

export function createDatabaseClient(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  return db;
}
