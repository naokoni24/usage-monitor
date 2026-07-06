import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const dbPath = path.resolve(__dirname, 'tmp/test.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(dbPath + suffix, { force: true });
}

const sqlite = new Database(dbPath);
migrate(drizzle(sqlite), { migrationsFolder: path.resolve(__dirname, '../drizzle') });
sqlite.close();
