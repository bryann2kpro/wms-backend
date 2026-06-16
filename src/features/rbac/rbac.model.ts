/**
 * RBAC (Role-Based Access Control) Model
 * 
 * @description Normalized RBAC schema for the WMS system.
 * 
 * Structure:
 * - Module: Feature areas (SUPPLIER_DELIVERY, GRN, DELIVERY_ORDER, etc.)
 * - Permission: CRUD actions linked to modules
 * - Role: User roles (STOREKEEPER, LOGISTIC, ADMIN, MANAGEMENT)
 * - RolePermission: Junction table linking roles to permissions
 * - UserRole: Junction table linking users to roles
 */

import { timestamp, uuid, varchar, unique } from "drizzle-orm/pg-core";
import { MainSchema } from "@/db/db.schema";
import { UsersTable } from "@/features/auth/auth.model";
import { OrganizationsTable } from "@/features/master-data/organization.model";

// ============================================
// ROLE TABLE
// ============================================

/**
 * Role Table
 * 
 * @description Defines user roles in the WMS system.
 * 
 * @roles
 * - STOREKEEPER: Warehouse staff (picking, packing, stock management)
 * - LOGISTIC: Driver/Runner (delivery execution, proof of delivery)
 * - ADMIN: Company Admin (approval, stock in-out, invoices, operation support)
 * - MANAGEMENT: Management (approval optional, access to overall reports)
 */
export const Role = MainSchema.table('m_role', {
  roleId: uuid('role_id').defaultRandom().primaryKey().notNull(),
  organizationId: uuid('organization_id').notNull().references(() => OrganizationsTable.organizationId),
  roleName: varchar('role_name', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by', { length: 40 }).notNull(),
  updatedBy: varchar('updated_by', { length: 40 }).notNull(),
}, (table) => ({
  uniqueOrgRole: unique().on(table.organizationId, table.roleName),
}));

export type RoleFilter = {
  roleId?: string;
  roleName?: string;
  status?: string;
};
export type RoleType = typeof Role.$inferSelect;
export type RoleInsertType = typeof Role.$inferInsert;

// ============================================
// MODULE TABLE
// ============================================

/**
 * Module Table
 * 
 * @description Defines feature modules in the WMS system.
 * Each module groups related permissions.
 * 
 * @modules
 * - SUPPLIER_DELIVERY: Inbound supplier deliveries
 * - GRN: Goods Received Notes
 * - TRANSFER_ORDER: NetSuite transfer orders
 * - DELIVERY_ORDER: Outbound delivery orders
 * - EXCEPTION: Shortage/damage exceptions
 * - INVENTORY: Inventory management
 * - INVOICE: Invoice management
 * - SETTLEMENT: Settlement checklist
 * - REPORT: Reports and analytics
 * - USER: User management
 * - ROLE: Role management
 */
export const Module = MainSchema.table('m_module', {
  moduleId: uuid('module_id').defaultRandom().primaryKey().notNull(),
  moduleName: varchar('module_name', { length: 50 }).notNull().unique(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by', { length: 40 }).notNull(),
  updatedBy: varchar('updated_by', { length: 40 }).notNull(),
});

export type ModuleFilter = {
  moduleId?: string;
  moduleName?: string;
  status?: string;
};
export type ModuleType = typeof Module.$inferSelect;
export type ModuleInsertType = typeof Module.$inferInsert;
export type ModuleGroupType = {
  moduleName: string;
  permission: Array<{
    moduleId: string;
    permissionId: string;
    permissionType: string;
    description: string;
  }>;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

/**
 * Module with Permission Type
 * @description Type for module data with associated permission info (returned by getModule)
 */
export type ModuleWithPermissionType = {
  id: string;
  moduleName: string;
  permissionId: string;
  permissionType: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

// ============================================
// PERMISSION TABLE
// ============================================

/**
 * Permission Table
 * 
 * @description Defines granular permissions linked to modules.
 * 
 * @permissionTypes
 * - VIEW: Read access
 * - CREATE: Create new records
 * - UPDATE: Modify existing records
 * - DELETE: Remove records
 * - APPROVE: Approve/reject actions
 * - EXPORT: Export data
 */
export const Permission = MainSchema.table('m_permission', {
  permissionId: uuid('permission_id').defaultRandom().primaryKey().notNull(),
  moduleId: uuid('module_id').notNull().references(() => Module.moduleId),
  permissionType: varchar('permission_type', { length: 50 }).notNull(),
  description: varchar('description', { length: 255 }),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by', { length: 40 }).notNull(),
  updatedBy: varchar('updated_by', { length: 40 }).notNull(),
}, (table) => ({
  uniqueModulePermission: unique().on(table.moduleId, table.permissionType),
}));

export type PermissionFilter = {
  permissionId?: string | string[];
  moduleId?: string | string[];
  permissionType?: string;
  status?: string;
};
export type PermissionType = typeof Permission.$inferSelect;
export type PermissionInsertType = typeof Permission.$inferInsert;

// ============================================
// ROLE PERMISSION TABLE (Junction)
// ============================================

/**
 * Role Permission Table
 * 
 * @description Junction table linking roles to permissions.
 * Defines which permissions each role has.
 */
export const RolePermission = MainSchema.table('role_permission', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  roleId: uuid('role_id').notNull().references(() => Role.roleId),
  permissionId: uuid('permission_id').notNull().references(() => Permission.permissionId),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by', { length: 40 }).notNull(),
  updatedBy: varchar('updated_by', { length: 40 }).notNull(),
}, (table) => ({
  uniqueRolePermission: unique().on(table.roleId, table.permissionId),
}));

export type RolePermissionFilter = {
  roleId?: string;
  permissionId?: string;
};
export type RolePermissionType = typeof RolePermission.$inferSelect;
export type RolePermissionInsertType = typeof RolePermission.$inferInsert;
export type RolePermissionUpdateType = {
  permissionIds: string[];
  createdBy?: string;
  updatedBy: string;
};
export type RolePermissionGroupType = {
  id: string;
  roleId: string;
  permissionId: string;
  permissionType: string;
  moduleId: string;
  moduleName: string;
};

// ============================================
// USER ROLE TABLE (Junction)
// ============================================

/**
 * User Role Table
 * 
 * @description Junction table linking users to roles.
 * Allows users to have multiple roles.
 */
export const UserRole = MainSchema.table('user_role', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  userId: uuid('user_id').notNull().references(() => UsersTable.id),
  roleId: uuid('role_id').notNull().references(() => Role.roleId),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by', { length: 40 }).notNull(),
  updatedBy: varchar('updated_by', { length: 40 }).notNull(),
}, (table) => ({
  uniqueUserRole: unique().on(table.userId, table.roleId),
}));

export type UserRoleFilter = {
  id?: string | string[];
  userId?: string | string[];
  roleId?: string | string[];
  status?: string;
};
export type UserRoleType = typeof UserRole.$inferSelect;
export type UserRoleInsertType = typeof UserRole.$inferInsert;

// ============================================
// ENUMS & CONSTANTS
// ============================================

/**
 * Role Codes
 * @description Available role codes in the WMS system
 */
export const RoleCode = {
  /** Warehouse Staff - picking, packing, stock management */
  STOREKEEPER: 'Storekeeper',
  /** Driver/Runner - delivery execution, proof of delivery */
  LOGISTIC: 'Logistic',
  /** Company Admin - approval, stock in-out, invoices, operation support */
  ADMIN: 'Admin',
  /** Management - approval (optional), access to overall reports */
  MANAGEMENT: 'Management',
  /** Super Admin - full access to all modules and permissions */
  SUPER_ADMIN: 'Super Admin',
} as const;

export type RoleCodeType = typeof RoleCode[keyof typeof RoleCode];

/**
 * Module Names
 * @description Available modules in the WMS system
 */
export const ModuleName = {
  SUPPLIER_DELIVERY: 'Supplier Delivery',
  GRN: 'GRN',
  TRANSFER_ORDER: 'Transfer Order',
  DELIVERY_ORDER: 'Delivery Order',
  EXCEPTION: 'Exception',
  INVENTORY: 'Inventory',
  RETURN: 'Return',
  INVOICE: 'Invoice',
  SETTLEMENT: 'Settlement',
  REPORT: 'Report',
  USER: 'User',
  ROLE: 'Role',
} as const;

export type ModuleNameType = typeof ModuleName[keyof typeof ModuleName];

/**
 * Permission Types
 * @description Available permission types
 */
export const PermissionTypeCode = {
  READ: 'Read',
  CREATE: 'Create',
  UPDATE: 'Update',
  DELETE: 'Delete',
  APPROVE: 'Approve',
  EXPORT: 'Export',
  CONFIRM: 'Confirm',
  PICK: 'Pick',
  PACK: 'Pack',
  DISPATCH: 'Dispatch',
} as const;

export type PermissionTypeCodeType = typeof PermissionTypeCode[keyof typeof PermissionTypeCode];

/**
 * Permission Group Enum
 * @description Groups for categorizing permissions (for UI display)
 */

export enum PermissionGroup {
  ROLE = 'Role',
}

// ============================================
// PAGINATION TYPES
// ============================================

/**
 * Pagination Parameters
 * @description Common pagination parameters for GET endpoints
 */
export type PaginationParams = {
  pageSize?: number;
  pageNumber?: number;
  sortBy?: string;
  sortOrder?: string;
};

/**
 * Pagination Metadata
 * @description Pagination information returned in API responses
 */
export type PaginationMeta = {
  count: number;
  totalCount: number;
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

/**
 * Paginated Response
 * @description Generic paginated response structure
 */
export type PaginatedResponse<T> = {
  query: T[];
  pagination: PaginationMeta;
};
