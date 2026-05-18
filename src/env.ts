import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
 
export const env = createEnv({
  server: {
    // Node stuffs
    PORT: z.string().transform(val => Number(val)).pipe(z.number().min(1).max(65535)).default(3000),
    NODE_ENV: z.enum(["development", "production", "test"]),
    // JWT Auth stuffs
    JWT_ALGORITHM: z.enum(["HS256", "RS256", "ES256", "PS256", "ES384", "PS384", "ES512", "PS512"]).default("RS256"),
    JWT_PRIVATE_KEY: z.string(),
    JWT_PUBLIC_KEY: z.string(),
    // PostgreSQL stuffs
    POSTGRES_USER: z.string().min(1),
    POSTGRES_PASSWORD: z.string().min(1),
    POSTGRES_HOST: z.string().min(1),
    POSTGRES_PORT: z.string().transform(val => Number(val)).pipe(z.number().min(1).max(65535)),
    POSTGRES_DB: z.string().min(1),
    DATABASE_URL: z.string(),
    // AWS S3 Bucket stuffs
    AWS_ACCESS_KEY_ID: z.string(),
    AWS_SECRET_ACCESS_KEY: z.string(),
    AWS_REGION: z.string(),
    AWS_BUCKET_NAME: z.string(),
    AWS_PRIVATE_BUCKET_NAME: z.string(),
    // Logging stuffs
    LOGGING_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    LOG_ENV: z.enum(["development", "production"]).default("development"),
    // redis stuffs
    REDIS_HOST: z.string().optional(),
    REDIS_PORT: z.string().transform(val => Number(val)).pipe(z.number().min(1).max(65535)).optional(),
    REDIS_DB: z.string().transform(val => Number(val)).pipe(z.number().min(1).max(10)).optional(),

    // SMTP stuffs
    SMTP_HOST: z.string(),
    SMTP_PORT: z.string().transform(val => Number(val)).pipe(z.number().min(1).max(65535)),
    SMTP_USER: z.string(),
    SMTP_PASSWORD: z.string(),
    SMTP_FROM: z.string().optional(),
    FRONTEND_URL: z.url().optional(),
    COMPANY_NAME: z.string().optional(),
    COMPANY_EMAIL: z.string().optional(),
    COMPANY_ADDRESS: z.string().optional(),
    // Email notification recipient
    ADMIN_EMAIL: z.string().email().optional(),
    // Invoice cron toggle (when not "true", cron does not start)
    INVOICES_CRON_ENABLED: z.string().optional(),
    // Daily opening stock cron toggle
    DAILY_OPENING_STOCK_CRON_ENABLED: z.string().optional(),
    WHATSAPP_ENABLED: z.string().optional(),
    SYSTEM_USER_UUID: z.uuid(),
    INVOICE_ADDRESS_SNAPSHOT_ID: z.uuid(),
    // NetSuite integration (OAuth 1.0a TBA)
    NETSUITE_ACCOUNT_ID: z.string(),
    NETSUITE_CONSUMER_KEY: z.string(),
    NETSUITE_CONSUMER_SECRET: z.string(),
    NETSUITE_TOKEN_ID: z.string(),
    NETSUITE_TOKEN_SECRET: z.string(),
    NETSUITE_ITEM_RECEIPT_URL: z.string().url(),
  },
 
  /**
   * The prefix that client-side variables must have. This is enforced both at
   * a type-level and at runtime.
   */
//   clientPrefix: "PUBLIC_",
 
//   client: {
//     PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
//   },
 
  /**
   * What object holds the environment variables at runtime. This is usually
   * `process.env` or `import.meta.env`.
   */
  runtimeEnv: process.env,
 
  /**
   * By default, this library will feed the environment variables directly to
   * the Zod validator.
   *
   * This means that if you have an empty string for a value that is supposed
   * to be a number (e.g. `PORT=` in a ".env" file), Zod will incorrectly flag
   * it as a type mismatch violation. Additionally, if you have an empty string
   * for a value that is supposed to be a string with a default value (e.g.
   * `DOMAIN=` in an ".env" file), the default value will never be applied.
   *
   * In order to solve these issues, we recommend that all new projects
   * explicitly specify this option as true.
   */
  emptyStringAsUndefined: true,
});