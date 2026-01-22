import { timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { MainSchema } from "@/db/db.schema";

// Role
export const Role = MainSchema.table('role', {
  roleId:       uuid('role_id').defaultRandom().notNull(),
  roleName:     varchar('role_name', { length: 40 }).notNull(),
  permissionId: varchar('permission_id', { length: 40 }).array(),
  status:       varchar('status', { length: 20 }).notNull(),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy:    varchar('created_by', { length: 40 }).notNull(),
  updatedBy:    varchar('updated_by', { length: 40 }).notNull(),
});

// Permission
export const Permission = MainSchema.table('permission', {
  permissionId: uuid('permission_id').defaultRandom().notNull(),
  permissionName: varchar('permission_name', { length: 40 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by', { length: 40 }).notNull(),
  updatedBy: varchar('updated_by', { length: 40 }).notNull(),
});

/**
 * Role Codes Enum
 * @description Available role codes in the WMS system
 */
export const RoleCode = {
  /** Warehouse Staff - picking, packing, stock management */
  STOREKEEPER: 'STOREKEEPER',
  /** Driver/Runner - delivery execution, proof of delivery */
  LOGISTIC: 'LOGISTIC',
  /** Company Admin - approval, stock in-out, invoices, operation support */
  ADMIN: 'ADMIN',
  /** Management - approval (optional), access to overall reports */
  MANAGEMENT: 'MANAGEMENT',
} as const;

export type RoleCodeType = typeof RoleCode[keyof typeof RoleCode];

/**
 * Permission Codes
 * @description Available permissions that can be assigned to roles
 */
export const PermissionCode = {
  // Inbound
  SUPPLIER_DELIVERY_VIEW: 'SUPPLIER_DELIVERY_VIEW',
  SUPPLIER_DELIVERY_CREATE: 'SUPPLIER_DELIVERY_CREATE',
  SUPPLIER_DELIVERY_CONFIRM: 'SUPPLIER_DELIVERY_CONFIRM',
  GRN_VIEW: 'GRN_VIEW',
  GRN_CREATE: 'GRN_CREATE',
  GRN_APPROVE: 'GRN_APPROVE',
  
  // Outbound
  TRANSFER_ORDER_VIEW: 'TRANSFER_ORDER_VIEW',
  TRANSFER_ORDER_ACCEPT: 'TRANSFER_ORDER_ACCEPT',
  DELIVERY_ORDER_VIEW: 'DELIVERY_ORDER_VIEW',
  DELIVERY_ORDER_CREATE: 'DELIVERY_ORDER_CREATE',
  DELIVERY_ORDER_PICK: 'DELIVERY_ORDER_PICK',
  DELIVERY_ORDER_PACK: 'DELIVERY_ORDER_PACK',
  DELIVERY_ORDER_DISPATCH: 'DELIVERY_ORDER_DISPATCH',
  DELIVERY_ORDER_CONFIRM: 'DELIVERY_ORDER_CONFIRM',
  
  // Exceptions
  EXCEPTION_VIEW: 'EXCEPTION_VIEW',
  EXCEPTION_REPORT: 'EXCEPTION_REPORT',
  EXCEPTION_APPROVE: 'EXCEPTION_APPROVE',
  
  // Inventory
  INVENTORY_VIEW: 'INVENTORY_VIEW',
  INVENTORY_ADJUST: 'INVENTORY_ADJUST',
  
  // Invoicing
  INVOICE_VIEW: 'INVOICE_VIEW',
  INVOICE_CREATE: 'INVOICE_CREATE',
  INVOICE_ISSUE: 'INVOICE_ISSUE',
  
  // Settlement
  SETTLEMENT_VIEW: 'SETTLEMENT_VIEW',
  SETTLEMENT_MANAGE: 'SETTLEMENT_MANAGE',
  
  // Reports
  REPORT_VIEW: 'REPORT_VIEW',
  REPORT_EXPORT: 'REPORT_EXPORT',
  
  // Admin
  USER_VIEW: 'USER_VIEW',
  USER_MANAGE: 'USER_MANAGE',
  ROLE_MANAGE: 'ROLE_MANAGE',
  SYSTEM_CONFIG: 'SYSTEM_CONFIG',
} as const;

export type PermissionCodeType = typeof PermissionCode[keyof typeof PermissionCode];
