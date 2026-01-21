import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { env } from './src/env';

config({ path: '.env' });


console.log('🚀 DATABASE_URL', env.DATABASE_URL);

export default defineConfig({
  schema: [
    './src/db/db.schema.ts',
    './src/features/**/*.model.ts'
  ],
  out: './postgres/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});