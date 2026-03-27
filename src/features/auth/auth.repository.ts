/**
 * Auth Repository
 * 
 * @description Data access layer for authentication-related operations.
 * Handles user, role, permission, and junction table CRUD operations.
 * 
 * Uses normalized RBAC structure:
 * - Users → UserRole (junction) → Role
 * - Role → RolePermission (junction) → Permission → Module
 */

import { UsersTable, UserType, UserInsertType, PasswordResetTokensTable, PasswordResetTokenType } from './auth.model.js';
import { 
  Role, 
  Module,
  Permission, 
  RolePermission, 
  UserRole,
  type RoleType,
  type RoleInsertType,
  type ModuleType,
  type PermissionType,
  type PermissionInsertType,
  type RolePermissionType,
  type RolePermissionInsertType,
  type UserRoleType,
  type UserRoleInsertType,
  type RolePermissionGroupType,
} from '@/features/rbac/rbac.model.js';
import { db } from '@/db/index';
import { eq, and, inArray, asc, desc, or, sql, ilike, type SQL } from 'drizzle-orm';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { JwtControllerClass } from '@/features/jwt/jwt.controller.js';
import { logger } from '@/util/logger.js';
import { DbTransaction } from '@/types/db-transaction.js';
import { UserRoleWithPermissionType } from '../rbac/rbac.repository.js';

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

      const user = await this.getUserByEmail(decodedToken.username);
      return user;
    } catch (error) {
      logger.error('❌ [AuthRepository.getUserDataByToken] Error:', error);
      return null;
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<UserType | null> {
    try {
      const users = await db
        .select()
        .from(UsersTable)
        .where(eq(UsersTable.email, email))
        .limit(1);
      
      return users.length > 0 ? users[0] : null;
    } catch (error) {
      logger.error('❌ [AuthRepository.getUserByEmail] Error:', error);
      // Do not return null on DB failures — callers would treat it as "user not found" (e.g. 401 on login).
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<UserType | null> {
    try {
      const users = await db
        .select()
        .from(UsersTable)
        .where(eq(UsersTable.id, id))
        .limit(1);
      
      return users.length > 0 ? users[0] : null;
    } catch (error) {
      logger.error('❌ [AuthRepository.getUserById] Error:', error);
      return null;
    }
  }

  /**
   * Batch load users by IDs (for avoiding N+1 in GraphQL)
   */
  async getUsersByIds(ids: string[]): Promise<UserType[]> {
    if (ids.length === 0) return [];
    try {
      const users = await db
        .select()
        .from(UsersTable)
        .where(inArray(UsersTable.id, ids));
      return users;
    } catch (error) {
      logger.error('❌ [AuthRepository.getUsersByIds] Error:', error);
      return [];
    }
  }

  /**
   * Get user IDs that have the given role (active assignment). Used for filter by roleId.
   */
  async getUserIdsByRoleId(roleId: string): Promise<string[]> {
    try {
      const rows = await db
        .select({ userId: UserRole.userId })
        .from(UserRole)
        .where(and(eq(UserRole.roleId, roleId), eq(UserRole.status, 'active')));
      return rows.map((r) => r.userId);
    } catch (error) {
      logger.error('❌ [AuthRepository.getUserIdsByRoleId] Error:', error);
      return [];
    }
  }

  /**
   * Batch load roles for multiple users (for users list to avoid N+1). Returns flat array; caller groups by userId.
   */
  async getRolesForUserIds(userIds: string[]): Promise<Array<{ userId: string; roleId: string; roleName: string }>> {
    if (userIds.length === 0) return [];
    try {
      const results = await db
        .select({
          userId: UserRole.userId,
          roleId: Role.roleId,
          roleName: Role.roleName,
        })
        .from(UserRole)
        .innerJoin(Role, eq(UserRole.roleId, Role.roleId))
        .where(and(inArray(UserRole.userId, userIds), eq(UserRole.status, 'active')));
      return results;
    } catch (error) {
      logger.error('❌ [AuthRepository.getRolesForUserIds] Error:', error);
      return [];
    }
  }

  /**
   * Get users with filter, sort, and pagination (REST-style: filter/sort/pagination in repository).
   * Used by GraphQL users query and any client that needs paginated user list.
   */
  async getUsersPaginated(params: {
    filter?: { email?: string; displayName?: string; isActive?: boolean; roleId?: string };
    sort?: { field: 'EMAIL' | 'DISPLAY_NAME' | 'CREATED_AT' | 'UPDATED_AT'; direction: 'ASC' | 'DESC' };
    page: number;
    pageSize: number;
    organizationId?: string | null;
  }): Promise<{ users: UserType[]; totalCount: number }> {
    const { filter, sort, page, pageSize, organizationId } = params;
    const conditions: Array<SQL | undefined> = [];

    if (organizationId != null && !organizationId.endsWith("0001")) {
      conditions.push(eq(UsersTable.primaryOrganizationId, organizationId));
    }

    // Search (frontend sends same term in email + displayName) – treat as OR across both fields, case-insensitive
    if (filter?.email && filter?.displayName && filter.email === filter.displayName) {
      const term = `%${filter.email}%`;
      conditions.push(
        or(ilike(UsersTable.email, term), ilike(UsersTable.displayName, term)),
      );
    } else {
      if (filter?.email) {
        conditions.push(ilike(UsersTable.email, `%${filter.email}%`));
      }
      if (filter?.displayName) {
        conditions.push(ilike(UsersTable.displayName, `%${filter.displayName}%`));
      }
    }
    if (filter?.isActive !== undefined) {
      conditions.push(eq(UsersTable.isActive, filter.isActive));
    }

    if (filter?.roleId) {
      const userIdsWithRole = await this.getUserIdsByRoleId(filter.roleId);
      if (userIdsWithRole.length === 0) {
        logger.info('ℹ️ [AuthRepository.getUsersPaginated] No users with roleId:', filter.roleId);
        return { users: [], totalCount: 0 };
      }
      conditions.push(inArray(UsersTable.id, userIdsWithRole));
    }

    const whereConditions = conditions.filter(
      (c): c is SQL => c !== undefined,
    );
    const whereClause =
      whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const sortColumn =
      sort?.field === 'EMAIL' ? UsersTable.email
      : sort?.field === 'DISPLAY_NAME' ? UsersTable.displayName
      : sort?.field === 'UPDATED_AT' ? UsersTable.updatedAt
      : UsersTable.createdAt;
    const sortDirection = sort?.direction === 'DESC' ? desc : asc;

    const [countRow] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(UsersTable)
      .where(whereClause);
    const totalCount = Number(countRow?.value ?? 0);

    const users = await db
      .select()
      .from(UsersTable)
      .where(whereClause)
      .orderBy(sortDirection(sortColumn))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    logger.info('ℹ️ [AuthRepository.getUsersPaginated] Fetched page', page, 'totalCount:', totalCount);
    return { users, totalCount };
  }

  /**
   * Create a new user
   */
  async createUser(
    userData: Omit<UserInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction
  ): Promise<UserType> {
    try {
      const dbClient = tx || db;
      
      logger.info('ℹ️ [AuthRepository.createUser] Creating user...');
      
      const [user] = await dbClient
        .insert(UsersTable)
        .values(userData)
        .returning();
      
      logger.info('✅ [AuthRepository.createUser] User created successfully');
      return user;
    } catch (error) {
      logger.error('❌ [AuthRepository.createUser] Error:', error);
      throw error;
    }
  }

  /**
   * Update user by ID
   */
  async updateUser(id: string, userData: Partial<UserInsertType>, tx?: DbTransaction): Promise<UserType | null> {
    try {
      const dbClient = tx || db;
      
      logger.info('ℹ️ [AuthRepository.updateUser] Updating user...');
      
      const [user] = await dbClient
        .update(UsersTable)
        .set({ ...userData, updatedAt: new Date() })
        .where(eq(UsersTable.id, id))
        .returning();
      
      logger.info('✅ [AuthRepository.updateUser] User updated successfully');
      return user || null;
    } catch (error) {
      logger.error('❌ [AuthRepository.updateUser] Error:', error);
      return null;
    }
  }

  /**
   * Create a new user and assign a role in a single transaction.
   * Use this for GraphQL createUser / any flow that needs user + role atomically.
   */
  async createUserWithRole(
    userData: Omit<UserInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    roleId: string
  ): Promise<UserType> {
    logger.info('ℹ️ [AuthRepository.createUserWithRole] Creating user with role...', {
      email: userData.email,
      roleId,
    });
    const newUser = await db.transaction(async (tx) => {
      const user = await this.createUser(userData, tx);
      await this.assignRoleToUser(
        {
          userId: user.id,
          roleId,
          status: 'active',
          createdBy: userData.createdBy ?? 'system',
          updatedBy: userData.updatedBy ?? 'system',
        },
        tx
      );
      return user;
    });
    logger.info('✅ [AuthRepository.createUserWithRole] User created with role:', newUser.email);
    return newUser;
  }

  /**
   * Update user and optionally replace role in a single transaction.
   * User table is always updated (updatedAt/updatedBy) in the same transaction as role changes.
   */
  async updateUserWithRole(
    userId: string,
    userUpdateData: Partial<UserInsertType>,
    options?: { roleId?: string | null }
  ): Promise<UserType | null> {
    logger.info('ℹ️ [AuthRepository.updateUserWithRole] Updating user with role...', {
      userId,
      roleId: options?.roleId ?? null,
    });
    const currentRoles = await this.getUserRoles(userId);

    await db.transaction(async (tx) => {
      // Always update User row so users.updatedAt/updatedBy stay in sync (updateUser sets updatedAt)
      const userPayload: Partial<UserInsertType> = { updatedBy: 'system', ...userUpdateData };
      await this.updateUser(userId, userPayload, tx);

      if (options?.roleId != null && options.roleId !== '') {
        for (const r of currentRoles) {
          await this.removeRoleFromUser(userId, r.roleId, tx);
        }
        await this.assignRoleToUser(
          {
            userId,
            roleId: options.roleId,
            status: 'active',
            createdBy: 'system',
            updatedBy: 'system',
          },
          tx
        );
      }
    });

    const updated = await this.getUserById(userId);
    logger.info('✅ [AuthRepository.updateUserWithRole] User updated:', userId);
    return updated;
  }

  // ============================================
  // USER ROLE OPERATIONS (Junction Table)
  // ============================================

  /**
   * Get user's roles
   */
  async getUserRoles(userId: string | string[]): Promise<Array<RoleType & { userRoleId: string }>> {
    try {
      const results = await db
        .select({
          userRoleId: UserRole.id,
          organizationId: Role.organizationId,
          roleId: Role.roleId,
          roleName: Role.roleName,
          status: Role.status,
          createdAt: Role.createdAt,
          updatedAt: Role.updatedAt,
          createdBy: Role.createdBy,
          updatedBy: Role.updatedBy,
        })
        .from(UserRole)
        .innerJoin(Role, eq(UserRole.roleId, Role.roleId))
        .where(and(
          Array.isArray(userId) ? inArray(UserRole.userId, userId as string[]) : eq(UserRole.userId, userId as string),
          eq(UserRole.status, 'active')
        ));
      
      return results;
    } catch (error) {
      logger.error('❌ [AuthRepository.getUserRoles] Error:', error);
      return [];
    }
  }

  /**
   * Get user role with permission
   */
  async getUserRoleWithPermission(userId: string): Promise<UserRoleWithPermissionType[]> {
    try {
      logger.info('ℹ️ [AuthRepository.getUserRoleWithPermission] Getting user role with permission...');
      const results = await db
        .select({
          id: UserRole.id,
          userId: UserRole.userId,
          roleId: UserRole.roleId,
          roleName: Role.roleName,
          status: UserRole.status,
          permissionId: RolePermission.permissionId,
          permissionType: Permission.permissionType,
          moduleId: Permission.moduleId,
          moduleName: Module.moduleName,
        })
        .from(UserRole)
        .innerJoin(Role, eq(UserRole.roleId, Role.roleId))
        .innerJoin(RolePermission, eq(UserRole.roleId, RolePermission.roleId))
        .innerJoin(Permission, eq(RolePermission.permissionId, Permission.permissionId))
        .innerJoin(Module, eq(Permission.moduleId, Module.moduleId))
        .where(and(
          eq(UserRole.userId, userId),
          eq(UserRole.status, 'active')
        ))
        .orderBy(Module.moduleName);
      
      logger.info('✅ [AuthRepository.getUserRoleWithPermission] User role with permission fetched successfully');

      return results;
    } catch (error) {
      logger.error('❌ [AuthRepository.getUserRoleWithPermission] Error:', error);
      return [];
    }
  }

  /**
   * Assign role to user
   */
  async assignRoleToUser(
    data: Omit<UserRoleInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction
  ): Promise<UserRoleType> {
    try {
      const dbClient = tx || db;
      
      logger.info('ℹ️ [AuthRepository.assignRoleToUser] Assigning role to user...');
      
      const [userRole] = await dbClient
        .insert(UserRole)
        .values(data)
        .returning();
      
      logger.info('✅ [AuthRepository.assignRoleToUser] Role assigned successfully');
      return userRole;
    } catch (error) {
      logger.error('❌ [AuthRepository.assignRoleToUser] Error:', error);
      throw error;
    }
  }

  /**
   * Remove role from user
   */
  async removeRoleFromUser(userId: string, roleId: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx || db;
      
      logger.info('ℹ️ [AuthRepository.removeRoleFromUser] Removing role from user...');
      
      await dbClient
        .delete(UserRole)
        .where(and(
          eq(UserRole.userId, userId),
          eq(UserRole.roleId, roleId)
        ));
      
      logger.info('✅ [AuthRepository.removeRoleFromUser] Role removed successfully');
      return true;
    } catch (error) {
      logger.error('❌ [AuthRepository.removeRoleFromUser] Error:', error);
      return false;
    }
  }

  // ============================================
  // ROLE OPERATIONS
  // ============================================

  /**
   * Get role by ID
   */
  async getRoleById(roleId: string): Promise<RoleType | null> {
    try {
      const roles = await db
        .select()
        .from(Role)
        .where(eq(Role.roleId, roleId))
        .limit(1);
      
      return roles.length > 0 ? roles[0] : null;
    } catch (error) {
      logger.error('❌ [AuthRepository.getRoleById] Error:', error);
      return null;
    }
  }

  /**
   * Get role by name
   */
  async getRoleByName(roleName: string): Promise<RoleType | null> {
    try {
      const roles = await db
        .select()
        .from(Role)
        .where(eq(Role.roleName, roleName))
        .limit(1);
      
      return roles.length > 0 ? roles[0] : null;
    } catch (error) {
      logger.error('❌ [AuthRepository.getRoleByName] Error:', error);
      return null;
    }
  }

  /**
   * Get all roles
   */
  async getAllRoles(): Promise<RoleType[]> {
    try {
      const roles = await db.select().from(Role);
      return roles;
    } catch (error) {
      logger.error('❌ [AuthRepository.getAllRoles] Error:', error);
      return [];
    }
  }

  /**
   * Create a new role
   */
  async createRole(
    roleData: Omit<RoleInsertType, 'roleId' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction
  ): Promise<RoleType> {
    try {
      const dbClient = tx || db;
      
      logger.info('ℹ️ [AuthRepository.createRole] Creating role...');
      
      const [role] = await dbClient
        .insert(Role)
        .values(roleData)
        .returning();
      
      logger.info('✅ [AuthRepository.createRole] Role created successfully');
      return role;
    } catch (error) {
      logger.error('❌ [AuthRepository.createRole] Error:', error);
      throw error;
    }
  }

  /**
   * Update role by ID
   */
  async updateRole(roleId: string, roleData: Partial<RoleInsertType>, tx?: DbTransaction): Promise<RoleType | null> {
    try {
      const dbClient = tx || db;
      
      logger.info('ℹ️ [AuthRepository.updateRole] Updating role...');
      
      const [role] = await dbClient
        .update(Role)
        .set({ ...roleData, updatedAt: new Date() })
        .where(eq(Role.roleId, roleId))
        .returning();
      
      logger.info('✅ [AuthRepository.updateRole] Role updated successfully');
      return role || null;
    } catch (error) {
      logger.error('❌ [AuthRepository.updateRole] Error:', error);
      return null;
    }
  }

  // ============================================
  // MODULE OPERATIONS
  // ============================================

  /**
   * Get all modules
   */
  async getAllModules(): Promise<ModuleType[]> {
    try {
      const modules = await db.select().from(Module);
      return modules;
    } catch (error) {
      logger.error('❌ [AuthRepository.getAllModules] Error:', error);
      return [];
    }
  }

  /**
   * Get modules with permissions (grouped)
   */
  async getModulesWithPermissions(): Promise<Array<{
    moduleId: string;
    moduleName: string;
    permissionId: string;
    permissionType: string;
    description: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    updatedBy: string;
  }>> {
    try {
      const results = await db
        .select({
          moduleId: Module.moduleId,
          moduleName: Module.moduleName,
          permissionId: Permission.permissionId,
          permissionType: Permission.permissionType,
          description: Permission.description,
          status: Module.status,
          createdAt: Module.createdAt,
          updatedAt: Module.updatedAt,
          createdBy: Module.createdBy,
          updatedBy: Module.updatedBy,
        })
        .from(Module)
        .leftJoin(Permission, eq(Module.moduleId, Permission.moduleId));
      
      return results.map(r => ({
        ...r,
        permissionId: r.permissionId || '',
        permissionType: r.permissionType || '',
      }));
    } catch (error) {
      logger.error('❌ [AuthRepository.getModulesWithPermissions] Error:', error);
      return [];
    }
  }

  // ============================================
  // PERMISSION OPERATIONS
  // ============================================

  /**
   * Get permission by ID
   */
  async getPermissionById(permissionId: string): Promise<PermissionType | null> {
    try {
      const permissions = await db
        .select()
        .from(Permission)
        .where(eq(Permission.permissionId, permissionId))
        .limit(1);
      
      return permissions.length > 0 ? permissions[0] : null;
    } catch (error) {
      logger.error('❌ [AuthRepository.getPermissionById] Error:', error);
      return null;
    }
  }

  /**
   * Get all permissions
   */
  async getAllPermissions(): Promise<PermissionType[]> {
    try {
      const permissions = await db.select().from(Permission);
      return permissions;
    } catch (error) {
      logger.error('❌ [AuthRepository.getAllPermissions] Error:', error);
      return [];
    }
  }

  /**
   * Create a new permission
   */
  async createPermission(
    permissionData: Omit<PermissionInsertType, 'permissionId' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction
  ): Promise<PermissionType> {
    try {
      const dbClient = tx || db;
      
      logger.info('ℹ️ [AuthRepository.createPermission] Creating permission...');
      
      const [permission] = await dbClient
        .insert(Permission)
        .values(permissionData)
        .returning();
      
      logger.info('✅ [AuthRepository.createPermission] Permission created successfully');
      return permission;
    } catch (error) {
      logger.error('❌ [AuthRepository.createPermission] Error:', error);
      throw error;
    }
  }

  /**
   * Update permission by ID
   */
  async updatePermission(
    permissionId: string, 
    permissionData: Partial<PermissionInsertType>, 
    tx?: DbTransaction
  ): Promise<PermissionType | null> {
    try {
      const dbClient = tx || db;
      
      logger.info('ℹ️ [AuthRepository.updatePermission] Updating permission...');
      
      const [permission] = await dbClient
        .update(Permission)
        .set({ ...permissionData, updatedAt: new Date() })
        .where(eq(Permission.permissionId, permissionId))
        .returning();
      
      logger.info('✅ [AuthRepository.updatePermission] Permission updated successfully');
      return permission || null;
    } catch (error) {
      logger.error('❌ [AuthRepository.updatePermission] Error:', error);
      return null;
    }
  }

  // ============================================
  // ROLE PERMISSION OPERATIONS (Junction Table)
  // ============================================

  /**
   * Get role's permissions
   */
  async getRolePermissions(roleId: string): Promise<RolePermissionGroupType[]> {
    try {
      const results = await db
        .select({
          id: RolePermission.id,
          roleId: RolePermission.roleId,
          permissionId: RolePermission.permissionId,
          permissionType: Permission.permissionType,
          moduleId: Permission.moduleId,
          moduleName: Module.moduleName,
        })
        .from(RolePermission)
        .innerJoin(Permission, eq(RolePermission.permissionId, Permission.permissionId))
        .innerJoin(Module, eq(Permission.moduleId, Module.moduleId))
        .where(eq(RolePermission.roleId, roleId));
      
      return results;
    } catch (error) {
      logger.error('❌ [AuthRepository.getRolePermissions] Error:', error);
      return [];
    }
  }

  /**
   * Assign permission to role
   */
  async assignPermissionToRole(
    data: Omit<RolePermissionInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction
  ): Promise<RolePermissionType> {
    try {
      const dbClient = tx || db;
      
      logger.info('ℹ️ [AuthRepository.assignPermissionToRole] Assigning permission to role...');
      
      const [rolePermission] = await dbClient
        .insert(RolePermission)
        .values(data)
        .returning();
      
      logger.info('✅ [AuthRepository.assignPermissionToRole] Permission assigned successfully');
      return rolePermission;
    } catch (error) {
      logger.error('❌ [AuthRepository.assignPermissionToRole] Error:', error);
      throw error;
    }
  }

  /**
   * Remove all permissions from role
   */
  async removeAllPermissionsFromRole(roleId: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx || db;
      
      logger.info('ℹ️ [AuthRepository.removeAllPermissionsFromRole] Removing all permissions from role...');
      
      await dbClient
        .delete(RolePermission)
        .where(eq(RolePermission.roleId, roleId));
      
      logger.info('✅ [AuthRepository.removeAllPermissionsFromRole] Permissions removed successfully');
      return true;
    } catch (error) {
      logger.error('❌ [AuthRepository.removeAllPermissionsFromRole] Error:', error);
      return false;
    }
  }

  /**
   * Update role permissions (replace all)
   */
  async updateRolePermissions(
    roleId: string,
    permissionIds: string[],
    createdBy: string,
    updatedBy: string,
    tx?: DbTransaction
  ): Promise<RolePermissionType[]> {
    try {
      const dbClient = tx || db;
      
      logger.info('ℹ️ [AuthRepository.updateRolePermissions] Updating role permissions...');
      
      // Delete existing permissions
      await dbClient
        .delete(RolePermission)
        .where(eq(RolePermission.roleId, roleId));
      
      // Insert new permissions
      if (permissionIds.length > 0) {
        const newPermissions = await dbClient
          .insert(RolePermission)
          .values(permissionIds.map(permissionId => ({
            roleId,
            permissionId,
            createdBy,
            updatedBy,
          })))
          .returning();
        
        logger.info('✅ [AuthRepository.updateRolePermissions] Role permissions updated successfully');
        return newPermissions;
      }
      
      return [];
    } catch (error) {
      logger.error('❌ [AuthRepository.updateRolePermissions] Error:', error);
      throw error;
    }
  }

  /**
   * Get user's permissions via their roles
   * Returns all permissions for all roles assigned to the user
   */
  async getUserPermissions(userId: string): Promise<RolePermissionGroupType[]> {
    try {
      logger.info('ℹ️ [AuthRepository.getUserPermissions] Getting user permissions...');
      const results = await db
        .select({
          id: RolePermission.id,
          roleId: RolePermission.roleId,
          permissionId: RolePermission.permissionId,
          permissionType: Permission.permissionType,
          moduleId: Permission.moduleId,
          moduleName: Module.moduleName,
        })
        .from(UserRole)
        .innerJoin(RolePermission, eq(UserRole.roleId, RolePermission.roleId))
        .innerJoin(Permission, eq(RolePermission.permissionId, Permission.permissionId))
        .innerJoin(Module, eq(Permission.moduleId, Module.moduleId))
        .where(and(
          eq(UserRole.userId, userId),
          eq(UserRole.status, 'active')
        ));
      
      logger.info('✅ [AuthRepository.getUserPermissions] User permissions fetched successfully');
      return results;
    } catch (error) {
      logger.error('❌ [AuthRepository.getUserPermissions] Error:', error);
      return [];
    }
  }
  // ============================================
  // PASSWORD RESET TOKEN OPERATIONS
  // ============================================

  async createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await db
      .delete(PasswordResetTokensTable)
      .where(eq(PasswordResetTokensTable.userId, userId));

    await db.insert(PasswordResetTokensTable).values({ userId, token, expiresAt });
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetTokenType | null> {
    const rows = await db
      .select()
      .from(PasswordResetTokensTable)
      .where(eq(PasswordResetTokensTable.token, token))
      .limit(1);
    return rows[0] ?? null;
  }

  async deletePasswordResetToken(token: string): Promise<void> {
    await db
      .delete(PasswordResetTokensTable)
      .where(eq(PasswordResetTokensTable.token, token));
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await db
      .update(UsersTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(UsersTable.id, userId));
  }
}

// Re-export types for convenience
export type { 
  RoleType, 
  RoleInsertType,
  ModuleType,
  PermissionType, 
  PermissionInsertType,
  RolePermissionType,
  RolePermissionInsertType,
  UserRoleType,
  UserRoleInsertType,
  RolePermissionGroupType,
};
