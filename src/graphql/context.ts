/**
 * GraphQL Context
 * 
 * @description Defines the GraphQL context type and creation function.
 * The context is created for each request and provides authenticated user info.
 */

import DataLoader from 'dataloader';
import { Request } from 'express';
import { authRepository, jwtController, outletsRepository, regionRepository } from '@/composition-root';
import type { OutletWithRegion } from '@/features/master-data/outlets.repository';
import type { RegionType } from '@/features/master-data/region.model';
import { UserType } from '@/features/auth/auth.model';
import { UserRoleType } from '@/features/auth/auth.repository';
import { DbTransaction } from '@/types/db-transaction';

// ============================================
// TYPES
// ============================================

export interface UserRolePermission {
  id: string;
  userId: string;
  roleId: string;
  roleName: string;
  status: string;
  permissionId: string;
  permissionType: string;
  moduleId: string;
  moduleName: string;
}

export interface UserRole {
  id: string;
  userId: string;
  roleId: string;
  roleName: string;
  status: string;
}

/** DataLoader for batching outlet lookups by ID (avoids N+1 when resolving PurchaseOrder.outlet). */
export type OutletLoader = DataLoader<string, OutletWithRegion | null>;

/** DataLoader for batching region lookups by ID (avoids N+1 when resolving Outlet.region). */
export type RegionLoader = DataLoader<string, RegionType | null>;

/** DataLoader for batching user lookups by ID (avoids N+1 when resolving createdByUser/updatedByUser). */
export type UserLoader = DataLoader<string, UserType | null>;

export interface GraphQLContext {
  /** The authenticated user, or null if not authenticated */
  user: UserType | null;
  /** The organization ID from JWT token (for multi-tenant data isolation) */
  organizationId: string | null;
  /** The user's roles with permissions (for authorization checks) */
  userPermissions: UserRolePermission[];
  /** Whether the user is a Super Admin (bypasses all permission checks) */
  isSuperAdmin: boolean;
  /** The user's roles (for audit logs) */
  userRoles: UserRole[];
  /** The raw request object (for audit trail, etc.) */
  req: Request;
  /** Optional database transaction for atomic operations */
  tx?: DbTransaction;
  /** Batched outlet-by-ID loader (per request). Use when resolving PurchaseOrder.outlet. */
  getOutletLoader: () => OutletLoader;
  /** Batched region-by-ID loader (per request). Use when resolving Outlet.region. */
  getRegionLoader: () => RegionLoader;
  /** Batched user-by-ID loader (per request). Use when resolving createdByUser/updatedByUser. */
  getUserLoader: () => UserLoader;
}

// ============================================
// CONTEXT FACTORY
// ============================================

/**
 * Creates the GraphQL context for each request.
 * Extracts JWT from Authorization header and fetches user data.
 * 
 * @param req - Express request object
 * @returns GraphQL context with user info
 */
/** Creates the outlet DataLoader. One instance per request so batches are request-scoped. */
function createOutletLoader(): OutletLoader {
  return new DataLoader<string, OutletWithRegion | null>(async (ids) => {
    const uniqueIds = [...new Set(ids)];
    const result = await outletsRepository.getOutlet(
      { outletId: uniqueIds },
      { pageSize: Math.max(uniqueIds.length, 100), pageNumber: 1 }
    );
    const byId = new Map(result.query.map((o) => [o.outletId, o]));
    return ids.map((id) => byId.get(id) ?? null);
  });
}

/** Creates the user DataLoader. One instance per request so batches are request-scoped. */
function createUserLoader(): UserLoader {
  return new DataLoader<string, UserType | null>(async (ids) => {
    const uniqueIds = [...new Set(ids)];
    const users = await authRepository.getUsersByIds(uniqueIds);
    const byId = new Map(users.map((u) => [u.id, u]));
    return ids.map((id) => byId.get(id) ?? null);
  });
}

/** Creates the region DataLoader. One instance per request so batches are request-scoped. */
function createRegionLoader(): RegionLoader {
  return new DataLoader<string, RegionType | null>(async (ids) => {
    const uniqueIds = [...new Set(ids)];
    const result = await regionRepository.getRegion(
      { regionId: uniqueIds },
      { pageSize: Math.max(uniqueIds.length, 100), pageNumber: 1 }
    );
    const byId = new Map(result.query.map((r: RegionType) => [r.regionId, r]));
    return ids.map((id) => byId.get(id) ?? null);
  });
}

export async function createContext({ req }: { req: Request }): Promise<GraphQLContext> {
  const outletLoader = createOutletLoader();
  const regionLoader = createRegionLoader();
  const userLoader = createUserLoader();
  const context: GraphQLContext = {
    user: null,
    organizationId: null,
    userPermissions: [],
    isSuperAdmin: false,
    userRoles: [],
    req,
    getOutletLoader: () => outletLoader,
    getRegionLoader: () => regionLoader,
    getUserLoader: () => userLoader,
  };

  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return context;
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return context;
  }

  try {
    // Get user from token and extract organization ID
    const user = await authRepository.getUserDataByToken(token);
    if (!user) {
      return context;
    }

    context.user = user;

    // Extract organizationId from JWT token
    try {
      const jwtPayload = jwtController.verifyToken(token) as any;
      context.organizationId = jwtPayload?.organizationId ?? user.primaryOrganizationId ?? undefined;
    } catch {
      context.organizationId = user.primaryOrganizationId ?? undefined;
    }

    const userRoles = await authRepository.getUserRoles(user.id);
    context.userRoles = userRoles.map(role => ({
      id: role.userRoleId,
      userId: user.id,
      roleId: role.roleId,
      roleName: role.roleName,
      status: role.status,
    }));

    // Get user's roles with permissions
    const userPermissions = await authRepository.getUserRoleWithPermission(user.id);
    context.userPermissions = userPermissions;

    // Check if user is Super Admin
    context.isSuperAdmin = userPermissions.some(
      (permission) => permission.roleName === 'Super Admin'
    );

    return context;
  } catch (error) {
    // Token invalid or expired - return unauthenticated context
    return context;
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if user has a specific permission
 * 
 * @param context - GraphQL context
 * @param moduleName - Module name (e.g., 'Role', 'User')
 * @param permissionType - Permission type (e.g., 'Read', 'create', 'update')
 * @returns true if user has permission
 */
export function hasPermission(
  context: GraphQLContext,
  moduleName: string,
  permissionType: string
): boolean {
  // Super Admin bypasses all permission checks
  if (context.isSuperAdmin) {
    return true;
  }

  // Check if user has the specific permission
  return context.userPermissions.some(
    (permission) =>
      permission.moduleName === moduleName &&
      permission.permissionType === permissionType
  );
}

/**
 * Check if user is authenticated
 * 
 * @param context - GraphQL context
 * @returns true if user is authenticated
 */
export function isAuthenticated(context: GraphQLContext): boolean {
  return context.user !== null;
}

// ============================================
// AUDIT TRAIL HELPERS
// ============================================

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
}

/**
 * Add audit trail fields to input data based on action type.
 * Uses the authenticated user from context.
 * 
 * @param context - GraphQL context with authenticated user
 * @param input - The input data to add audit fields to
 * @param action - The action type (CREATE or UPDATE)
 * @returns Input with audit fields added
 * @throws Error if user is not authenticated
 */
export function withAuditTrail<T extends object>(
  context: GraphQLContext,
  input: T,
  action: AuditAction
): T & { createdBy?: string; updatedBy: string; updatedAt?: Date } {
  if (!context.user) {
    throw new Error('User must be authenticated to perform this action');
  }

  const userId = context.user.id;

  if (action === AuditAction.CREATE) {
    return {
      ...input,
      createdBy: userId,
      updatedBy: userId,
    };
  }

  // UPDATE action
  return {
    ...input,
    updatedBy: userId,
    updatedAt: new Date(),
  };
}

/**
 * Get the current user's ID from context.
 * Useful for audit trail when you need just the user ID.
 * 
 * @param context - GraphQL context
 * @returns User ID or null if not authenticated
 */
export function getCurrentUserId(context: GraphQLContext): string | null {
  return context.user?.id ?? null;
}
