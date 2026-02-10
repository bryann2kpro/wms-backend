import { MainSchema } from "@/db/db.schema";
import { uuid, text, timestamp, jsonb, bigserial, inet, index } from "drizzle-orm/pg-core";

export const AuditActionEnum = MainSchema.enum('audit_action', [
  'CREATE',
  'UPDATE',
  'DELETE',
]);

/**
 * Audit Log Table
 * 
 * @description Tracks changes to the database.
 * 
 * @field id - Primary key
 * @field userId - User who made the change
 * @field action - Type of change (CREATE, UPDATE, DELETE)
 * @field entity - Name of the table that was changed
 * @field entityId - ID of the record that was changed
 * @field oldData - Old values of the record that was changed
 * @field newData - New values of the record that was changed
 * @field ipAddress - IP address of the user who made the change
 * @field userAgent - User agent of the user who made the change
 */
export const AuditLogTable = MainSchema.table('audit_logs', {
    auditLogId: bigserial("audit_log_id", { mode: "number" }).notNull().primaryKey(),
    userId: uuid('user_id'),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    oldData: jsonb('old_data'),
    newData: jsonb('new_data'),
    ipAddress: inet('ip_address').notNull(),
    userAgent: text('user_agent').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
},
(table) => [
  index("audit_user_idx").on(table.userId),
  index("audit_entity_idx").on(table.entity, table.entityId),
  index("audit_created_idx").on(table.createdAt),
]);