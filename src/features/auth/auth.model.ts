import { timestamp, uuid, varchar, boolean } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';

/**
 * Users Table
 * 
 * @description Single source of truth for all WMS users.
 * Each user has a role that determines their permissions and access levels.
 * 
 * @field email - Unique email address for login
 * @field displayName - User's display name
 * @field passwordHash - Hashed password (bcrypt)
 * @field contactNo - Optional contact number
 * @field roleId - Reference to the user's role in the roles table
 * @field isActive - Whether the user account is active
 * 
 * @roles
 * - STOREKEEPER: Warehouse staff (picking, packing, stock management)
 * - LOGISTIC: Driver/Runner (delivery execution)
 * - ADMIN: Company Admin (approval, stock in-out, invoices, operation support)
 * - MANAGEMENT: Management (approval optional, access to overall reports)
 */
export const UsersTable = MainSchema.table('users', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  email: varchar('email', { length: 100 }).unique().notNull(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  contactNo: varchar('contact_no', { length: 20 }),
  roleId: uuid('role_id').notNull(),
  isActive: boolean('is_active').notNull().default(true),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

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
 * @description TypeScript type for User entity
 */
export type UserType = {
  id?: string;
  email: string;
  displayName: string;
  passwordHash: string;
  contactNo?: string;
  roleId: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
  updatedBy?: string;
};
