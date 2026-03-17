import { MainSchema } from "@/db/db.schema";
import { integer, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Params for running number generation.
 *
 * Note: Only `scope` + `prefix` are required for generating the numeric sequence.
 * The repository is responsible for incorporating the current date into the prefix.
 */
export type GenerateRunningNoParams = {
  scope: string;
  /** Logical prefix for the sequence (e.g. "PI") */
  prefix: string;
  /** Zero-pad width for suffix (used by callers) */
  width?: number;
};

export const RunningNoTable = MainSchema.table(
  "running_no",
  {
    id: uuid("id").defaultRandom().notNull().primaryKey(),
    scope: text("scope").notNull(),
    prefix: text("prefix").notNull(),
    dateKey: text("date_key").notNull(),
    currentValue: integer("current_value").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("running_no_scope_prefix_uniq").on(t.scope, t.prefix),
  ]
);

export type RunningNoType = typeof RunningNoTable.$inferSelect;
export type RunningNoInsertType = typeof RunningNoTable.$inferInsert;
