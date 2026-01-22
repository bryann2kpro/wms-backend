import { MainSchema } from "@/db/db.schema";
import { uuid, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * Sync Cursors Table
 * 
 * @description Tracks synchronization state with external systems.
 * Used to resume syncs from the last successful position and avoid duplicate processing.
 * 
 * @field source - Unique identifier for the sync source/operation
 * @field lastSuccessAt - Timestamp of last successful sync
 * @field lastCursorValue - Cursor/offset value to resume from
 * 
 * @source values:
 * - NETSUITE_TO_PULL: Pulling Transfer Orders from NetSuite
 * - NETSUITE_STOCK_PUSH: Pushing stock levels to NetSuite
 * - NETSUITE_GRN_PUSH: Pushing GRNs to NetSuite
 * - NETSUITE_DELIVERY_PUSH: Pushing delivery confirmations to NetSuite
 */
export const SyncCursorsTable = MainSchema.table('sync_cursors', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  source: text('source').unique().notNull(),
  lastSuccessAt: timestamp('last_success_at'),
  lastCursorValue: text('last_cursor_value'),

  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Integration Jobs Table
 * 
 * @description Queue and status tracking for integration jobs.
 * Manages async operations with external systems including retry logic.
 * 
 * @field jobType - Type of integration job
 * @field status - Current job status
 * @field attempt - Current attempt number (for retries)
 * @field nextRetryAt - When to retry (if failed)
 * @field payload - Input data for the job
 * @field result - Output/result data from the job
 * 
 * @jobType values:
 * - TO_PULL: Pull Transfer Orders from NetSuite
 * - STOCK_PUSH: Push stock levels to NetSuite
 * - GRN_PUSH: Push GRN to NetSuite
 * - DELIVERY_PUSH: Push delivery confirmation to NetSuite
 * 
 * @status values:
 * - PENDING: Job queued, waiting to run
 * - RUNNING: Job currently executing
 * - SUCCESS: Job completed successfully
 * - FAILED: Job failed (may retry based on attempt count)
 */
export const IntegrationJobsTable = MainSchema.table('integration_jobs', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  jobType: text('job_type').notNull(),
  status: text('status').notNull().default('PENDING'),
  attempt: integer('attempt').notNull().default(0),
  nextRetryAt: timestamp('next_retry_at'),
  payload: jsonb('payload'),
  result: jsonb('result'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
