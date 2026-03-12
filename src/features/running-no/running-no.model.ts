import { MainSchema } from "@/db/db.schema";
import { integer, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";

export type RunningNoScope = "invoice";

/**
 * Params for running number generation.
 *
 * Note: Only `scope` + `partitionKey` are required for generating the numeric sequence.
 * Other fields are kept for caller convenience (formatting/padding happens outside).
 */
export type GenerateRunningNoParams = {
  scope: RunningNoScope;
  /** Partition key (ex: "20300101") to reset sequence per key */
  partitionKey: string;
  /** Zero-pad width for suffix (used by callers) */
  width?: number;
  /** Prefix for callers to format full identifier (used by callers) */
  matchPrefix?: string;
  /** Optional SQL LIKE escape char if needed (used by callers) */
  likeEscape?: string;
};

export const RunningNoTable = MainSchema.table(
  "running_no",
  {
    id: uuid("id").defaultRandom().notNull().primaryKey(),

    scope: text("scope").notNull(),
    partitionKey: text("partition_key").notNull(),

    /** Last issued number for (scope, partition_key). Next value is currentValue + 1. */
    currentValue: integer("current_value").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    runningNoUnique: uniqueIndex("running_no_scope_partition_key_uniq").on(t.scope, t.partitionKey),
  })
);

export type RunningNoType = typeof RunningNoTable.$inferSelect;
export type RunningNoInsertType = typeof RunningNoTable.$inferInsert;
