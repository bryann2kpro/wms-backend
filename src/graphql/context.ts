/**
 * GraphQL Context
 * 
 * @description Defines the GraphQL context type and creation function.
 * The context is created for each request and provides authenticated user info.
 */

import { Request } from 'express';
import { authRepository } from '@/composition-root';
import { UserType } from '@/features/auth/auth.model';
import { UserRoleType } from '@/features/auth/auth.repository';

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

export interface GraphQLContext {
  /** The authenticated user, or null if not authenticated */
  user: UserType | null;
  /** The user's roles with permissions (for authorization checks) */
  userPermissions: UserRolePermission[];
  /** Whether the user is a Super Admin (bypasses all permission checks) */
  isSuperAdmin: boolean;
  /** The user's roles (for audit logs) */
  userRoles: UserRole[];
  /** The raw request object (for audit trail, etc.) */
  req: Request;
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
export async function createContext({ req }: { req: Request }): Promise<GraphQLContext> {
  const context: GraphQLContext = {
    user: null,
    userPermissions: [],
    isSuperAdmin: false,
    userRoles: [],
    req,
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
    // Get user from token
    const user = await authRepository.getUserDataByToken(token);
    if (!user) {
      return context;
    }

    context.user = user;

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
