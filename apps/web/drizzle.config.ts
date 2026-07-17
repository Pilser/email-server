import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    databaseId: process.env.DATABASE_ID!,
    accountId: process.env.ACCOUNT_ID!,
    token: process.env.CLOUDFLARE_API_TOKEN!,
  },
});
