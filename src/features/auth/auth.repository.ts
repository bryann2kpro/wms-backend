/**
 * Auth Repository
 * 
 * @description Data access layer for authentication-related operations.
 * Handles user, role, and permission CRUD operations.
 */

import { UsersTable, UserType } from './auth.model.js';
import { Role, Permission } from '@/features/rbac/rbac.model.js';
import { db } from '@/db/index';
import { eq } from 'drizzle-orm';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { JwtControllerClass } from '@/features/jwt/jwt.controller.js';
import { logger } from '@/util/logger.js';

/**
 * Role Type
 * @description TypeScript type for Role entity
 */
export type RoleType = {
  roleId?: string;
  roleName: string;
  permissionId: string[] | null;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy: string;
  updatedBy: string;
};

/**
 * Permission Type
 * @description TypeScript type for Permission entity
 */
export type PermissionType = {
  permissionId?: string;
  permissionName: string;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy: string;
  updatedBy: string;
};

export class AuthRepositoryClass {
  constructor(private jwtController: JwtControllerClass) {}

  // ============================================
  // USER OPERATIONS
  // ============================================

  /**
   * Get user data by JWT token
   * @param token - JWT access token
   * @returns User data or null if not found
   */
  async getUserDataByToken(token: string): Promise<UserType | null> {
    try {
      const decodedToken = await this.jwtController.verifyToken(token);

      if (!decodedToken.username) {
        throw new Error('(getUserByToken) Invalid token: username not found');
      }

      // Get user by email (primary login method)
      const user = await this.getUserByEmail(decodedToken.username);
      return user;
    } catch (error) {
      logger.error('❌ [AuthRepositoryClass.getUserDataByToken] Error getting user from token:', error);
      return null;
    }
  }

  /**
   * Get user by email
   * @param email - User email address
   * @returns User data or null if not found
   */
  async getUserByEmail(email: string): Promise<UserType | null> {
    try {
      
    const users = await db
        .select()
        .from(UsersTable)
        .where(eq(UsersTable.email, email))
        .limit(1);
      
      return users.length > 0 ? users[0] as unknown as UserType : null;
    } catch (error) {
      logger.error('❌ [AuthRepositoryClass.getUserByEmail] Error getting user by email:', error);
      return null;
    }
  }

  /**
   * Get user by ID
   * @param id - User UUID
   * @returns User data or null if not found
   */
  async getUserById(id: string): Promise<UserType | null> {
    try {
      const users = await db
        .select()
        .from(UsersTable)
        .where(eq(UsersTable.id, id))
        .limit(1);
      
      return users.length > 0 ? users[0] as unknown as UserType : null;
    } catch (error) {
      logger.error('❌ [AuthRepositoryClass.getUserById] Error getting user by ID:', error);
      return null;
    }
  }

  /**
   * Create a new user
   * @param userData - User data to insert
   * @param tx - Optional transaction
   * @returns Created user
   */
  async createUser(
    userData: Omit<UserType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: PgTransaction<NodePgQueryResultHKT, Record<string, never>, ExtractTablesWithRelations<Record<string, never>>>
  ): Promise<UserType> {
    try {
      const dbClient = tx || db;
      
      logger.info('ℹ️ [AuthRepositoryClass.createUser] Creating user...');
      
      const [user] = await dbClient
        .insert(UsersTable)
        .values(userData)
        .returning();
      
      logger.info('✅ [AuthRepositoryClass.createUser] User created successfully');
      logger.debug('✅ [AuthRepositoryClass.createUser] User data:', user);
      
      return user as unknown as UserType;
    } catch (error) {
      logger.error('❌ [AuthRepositoryClass.createUser] Error creating user:', error);
      throw error;
    }
  }

  /**
   * Update user by ID
   * @param id - User UUID
   * @param userData - Partial user data to update
   * @returns Updated user
   */
  async updateUser(id: string, userData: Partial<UserType>, tx?: PgTransaction<NodePgQueryResultHKT, Record<string, never>, ExtractTablesWithRelations<Record<string, never>>>): Promise<UserType | null> {
    try {
      
      const dbClient = tx || db;

      logger.info('ℹ️ [AuthRepositoryClass.updateUser] Updating user...');
      
      const [user] = await dbClient
        .update(UsersTable)
        .set({ ...userData, updatedAt: new Date() })
        .where(eq(UsersTable.id, id))
        .returning();
      
      logger.info('✅ [AuthRepositoryClass.updateUser] User updated successfully');
      
      return user ? user as unknown as UserType : null;
    } catch (error) {
      logger.error('❌ [AuthRepositoryClass.updateUser] Error updating user:', error);
      return null;
    }
  }

  // ============================================
  // ROLE OPERATIONS
  // ============================================

  /**
   * Get role by ID
   * @param roleId - Role UUID
   * @returns Role data or null if not found
   */
  async getRoleById(roleId: string): Promise<RoleType | null> {
    try {
      
      const roles = await db
        .select()
        .from(Role)
        .where(eq(Role.roleId, roleId))
        .limit(1);
      
      return roles.length > 0 ? roles[0] as unknown as RoleType : null;
    } catch (error) {
      logger.error('❌ [AuthRepositoryClass.getRoleById] Error getting role by ID:', error);
      return null;
    }
  }

  /**
   * Get role by name
   * @param roleName - Role name
   * @returns Role data or null if not found
   */
  async getRoleByName(roleName: string): Promise<RoleType | null> {
    try {
      const roles = await db
        .select()
        .from(Role)
        .where(eq(Role.roleName, roleName))
        .limit(1);
      
      return roles.length > 0 ? roles[0] as unknown as RoleType : null;
    } catch (error) {
      logger.error('❌ [AuthRepositoryClass.getRoleByName] Error getting role by name:', error);
      return null;
    }
  }

  /**
   * Get all roles
   * @returns Array of all roles
   */
  async getAllRoles(): Promise<RoleType[]> {
    try {
      const roles = await db.select().from(Role);
      return roles as unknown as RoleType[];
    } catch (error) {
      logger.error('❌ [AuthRepositoryClass.getAllRoles] Error getting all roles:', error);
      return [];
    }
  }

  /**
   * Create a new role
   * @param roleData - Role data to insert
   * @returns Created role
   */
  async createRole(roleData: Omit<RoleType, 'roleId' | 'createdAt' | 'updatedAt'>, tx?: PgTransaction<NodePgQueryResultHKT, Record<string, never>, ExtractTablesWithRelations<Record<string, never>>>): Promise<RoleType> {
    try {
      
      const dbClient = tx || db;

      logger.info('ℹ️ [AuthRepositoryClass.createRole] Creating role...');

      const [role] = await dbClient
        .insert(Role)
        .values(roleData)
        .returning();
      
      logger.info('✅ [AuthRepositoryClass.createRole] Role created successfully');
      logger.debug('✅ [AuthRepositoryClass.createRole] Role data:', role);
      
      return role as unknown as RoleType;
    } catch (error) {
      logger.error('❌ [AuthRepositoryClass.createRole] Error creating role:', error);
      throw error;
    }
  }

  /**
   * Update role by ID
   * @param roleId - Role UUID
   * @param roleData - Partial role data to update
   * @returns Updated role
   */
  async updateRole(roleId: string, roleData: Partial<RoleType>, tx?: PgTransaction<NodePgQueryResultHKT, Record<string, never>, ExtractTablesWithRelations<Record<string, never>>>): Promise<RoleType | null> {
    try {
      
      const dbClient = tx || db;
      
      logger.info('ℹ️ [AuthRepositoryClass.updateRole] Updating role...');
      
      const [role] = await dbClient
        .update(Role)
        .set({ ...roleData, updatedAt: new Date() })
        .where(eq(Role.roleId, roleId))
        .returning();
      
      logger.info('✅ [AuthRepositoryClass.updateRole] Role updated successfully');
      return role ? role as unknown as RoleType : null;
    } catch (error) {
      logger.error('❌ [AuthRepositoryClass.updateRole] Error updating role:', error);
      return null;
    }
  }

  // ============================================
  // PERMISSION OPERATIONS
  // ============================================

  /**
   * Get permission by ID
   * @param permissionId - Permission UUID
   * @returns Permission data or null if not found
   */
  async getPermissionById(permissionId: string): Promise<PermissionType | null> {
    try {

      const permissions = await db
        .select()
        .from(Permission)
        .where(eq(Permission.permissionId, permissionId))
        .limit(1);
      
      return permissions.length > 0 ? permissions[0] as unknown as PermissionType : null;
    } catch (error) {
      logger.error('❌ [AuthRepositoryClass.getPermissionById] Error getting permission by ID:', error);
      return null;
    }
  }

  /**
   * Get permission by name
   * @param permissionName - Permission name
   * @returns Permission data or null if not found
   */
  async getPermissionByName(permissionName: string): Promise<PermissionType | null> {
    try {
      const permissions = await db
        .select()
        .from(Permission)
        .where(eq(Permission.permissionName, permissionName))
        .limit(1);
      
      return permissions.length > 0 ? permissions[0] as unknown as PermissionType : null;
    } catch (error) {
      logger.error('❌ [AuthRepositoryClass.getPermissionByName] Error getting permission by name:', error);
      return null;
    }
  }

  /**
   * Get all permissions
   * @returns Array of all permissions
   */
  async getAllPermissions(): Promise<PermissionType[]> {
    try {
      const permissions = await db.select().from(Permission);
      return permissions as unknown as PermissionType[];
    } catch (error) {
      logger.error('❌ [AuthRepositoryClass.getAllPermissions] Error getting all permissions:', error);
      return [];
    }
  }

  /**
   * Create a new permission
   * @param permissionData - Permission data to insert
   * @returns Created permission
   */
  async createPermission(permissionData: Omit<PermissionType, 'permissionId' | 'createdAt' | 'updatedAt'>, tx?: PgTransaction<NodePgQueryResultHKT, Record<string, never>, ExtractTablesWithRelations<Record<string, never>>>): Promise<PermissionType> {
    try {
      
      const dbClient = tx || db;
      
      logger.info('ℹ️ [AuthRepositoryClass.createPermission] Creating permission...');
      
      const [permission] = await dbClient
        .insert(Permission)
        .values(permissionData)
        .returning();
        
      logger.info('✅ [AuthRepositoryClass.createPermission] Permission created successfully');
      logger.debug('✅ [AuthRepositoryClass.createPermission] Permission data:', permission);
      
      return permission as unknown as PermissionType;
    } catch (error) {
      logger.error('❌ [AuthRepositoryClass.createPermission] Error creating permission:', error);
      throw error;
    }
  }

  /**
   * Update permission by ID
   * @param permissionId - Permission UUID
   * @param permissionData - Partial permission data to update
   * @returns Updated permission
   */
  async updatePermission(permissionId: string, permissionData: Partial<PermissionType>, tx?: PgTransaction<NodePgQueryResultHKT, Record<string, never>, ExtractTablesWithRelations<Record<string, never>>>): Promise<PermissionType | null> {
    try {
      
      const dbClient = tx || db;
      
      logger.info('ℹ️ [AuthRepositoryClass.updatePermission] Updating permission...');
      
      const [permission] = await dbClient
        .update(Permission)
        .set({ ...permissionData, updatedAt: new Date() })
        .where(eq(Permission.permissionId, permissionId))
        .returning();

      logger.info('✅ [AuthRepositoryClass.updatePermission] Permission updated successfully');
      logger.debug('✅ [AuthRepositoryClass.updatePermission] Permission data:', permission);

      return permission ? permission as unknown as PermissionType : null;
    } catch (error) {
      logger.error('❌ [AuthRepositoryClass.updatePermission] Error updating permission:', error);
      return null;
    }
  }

  /**
   * Get user's permissions via their role
   * @param roleId - Role UUID
   * @returns Array of permission IDs or null
   */
  async getPermissionsByRoleId(roleId: string): Promise<string[] | null> {
    try {
      const role = await this.getRoleById(roleId);
      return role?.permissionId || null;
    } catch (error) {
      logger.error('❌ [AuthRepositoryClass.getPermissionsByRoleId] Error getting permissions by role ID:', error);
      return null;
    }
  }
}

// Export singleton instance
// export const authRepository = new AuthRepositoryClass();

// Export individual methods for convenience
// export const getUserDataByToken = authRepository.getUserDataByToken.bind(authRepository);
// export const getUserByEmail = authRepository.getUserByEmail.bind(authRepository);
// export const getUserById = authRepository.getUserById.bind(authRepository);
// export const createUser = authRepository.createUser.bind(authRepository);
// export const updateUser = authRepository.updateUser.bind(authRepository);
// export const getRoleById = authRepository.getRoleById.bind(authRepository);
// export const getRoleByName = authRepository.getRoleByName.bind(authRepository);
// export const getAllRoles = authRepository.getAllRoles.bind(authRepository);
// export const createRole = authRepository.createRole.bind(authRepository);
// export const updateRole = authRepository.updateRole.bind(authRepository);
// export const getPermissionById = authRepository.getPermissionById.bind(authRepository);
// export const getPermissionByName = authRepository.getPermissionByName.bind(authRepository);
// export const getAllPermissions = authRepository.getAllPermissions.bind(authRepository);
// export const createPermission = authRepository.createPermission.bind(authRepository);
// export const updatePermission = authRepository.updatePermission.bind(authRepository);
// export const getPermissionsByRoleId = authRepository.getPermissionsByRoleId.bind(authRepository);
