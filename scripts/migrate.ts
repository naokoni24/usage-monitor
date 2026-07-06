import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';

const url = process.env.DATABASE_URL ?? 'file:./data/ai-usage.db';
const dbPath = url.replace(/^file:/, '');
const resolved = path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
fs.mkdirSync(path.dirname(resolved), { recursive: true });

const sqlite = new Database(resolved);
const db = drizzle(sqlite);

migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });

console.log(`Migrations applied to ${resolved}`);
sqlite.close();
