import { timestamp, uuid, varchar, boolean } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { OrganizationsTable } from '@/features/master-data/organization.model';

/**
 * Users Table
 * 
 * @description Single source of truth for all WMS users.
 * User roles are managed via the UserRole junction table in rbac.model.ts.
 * 
 * @field email - Unique email address for login
 * @field displayName - User's display name
 * @field passwordHash - Hashed password (bcrypt)
 * @field contactNo - Optional contact number
 * @field isActive - Whether the user account is active
 * 
 * @note Roles are assigned via UserRole junction table (supports multi-role)
 */
export const UsersTable = MainSchema.table('users', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  email: varchar('email', { length: 100 }).unique().notNull(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  contactNo: varchar('contact_no', { length: 20 }),
  isActive: boolean('is_active').notNull().default(true),
  primaryOrganizationId: uuid('primary_organization_id').references(() => OrganizationsTable.organizationId),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by', { length: 40 }),
  updatedBy: varchar('updated_by', { length: 40 }),
});

/**
 * Password Reset Tokens Table
 *
 * @description Stores one-time tokens for password reset emails.
 * Tokens expire after 1 hour and are deleted after use.
 */
export const PasswordResetTokensTable = MainSchema.table('password_reset_tokens', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  userId: uuid('user_id').notNull().references(() => UsersTable.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 64 }).unique().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type PasswordResetTokenType = typeof PasswordResetTokensTable.$inferSelect;

/**
 * User Login DTO
 * @description Data transfer object for user login requests
 */
export type UserLoginDto = {
  email: string;
  password: string;
};

/**
 * User Type
 * @description TypeScript type for User entity (using Drizzle inference)
 */
export type UserType = typeof UsersTable.$inferSelect;
export type UserInsertType = typeof UsersTable.$inferInsert;

/**
 * User with Roles Type
 * @description User entity with roles attached (for API responses)
 */
export type UserWithRolesType = UserType & {
  roles?: Array<{
    roleId: string;
    roleName: string;
  }>;
};
