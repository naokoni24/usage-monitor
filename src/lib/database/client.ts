import 'server-only';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

function resolveDbPath(): string {
  const url = process.env.DATABASE_URL ?? 'file:./data/ai-usage.db';
  const filePath = url.replace(/^file:/, '');
  return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
}

const dbPath = resolveDbPath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export type Db = typeof db;
