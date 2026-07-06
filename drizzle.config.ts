import { defineConfig } from 'drizzle-kit';

const dbPath = (process.env.DATABASE_URL ?? 'file:./data/ai-usage.db').replace(/^file:/, '');

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/lib/database/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: dbPath,
  },
});
