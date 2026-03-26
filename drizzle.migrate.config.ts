import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env' });

if (!process.env.DATABASE_URL) {
  throw new Error('🚨 Database URL not initialized');
}

/**
 * Config for `drizzle-kit migrate` only (apply existing SQL under postgres/migrations).
 * Intentionally omits `schema` so no TypeScript models are loaded — safe for slim images
 * that ship dist + migrations but not src/.
 */
export default defineConfig({
  out: './postgres/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
