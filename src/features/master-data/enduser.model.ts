import { MainSchema } from "@/db/db.schema";
import { uuid, text } from "drizzle-orm/pg-core";

export const EndUserTable = MainSchema.table('m_end_user', {
  endUserId: uuid('end_user_id').defaultRandom().notNull().primaryKey(),
  userName: text('user_name').notNull(),
});

export type EndUserType = typeof EndUserTable.$inferSelect;
export type EndUserInsertType = typeof EndUserTable.$inferInsert;
