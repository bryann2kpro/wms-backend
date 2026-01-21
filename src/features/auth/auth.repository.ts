// DB
// Model
import { CompanyAdmin, CompanyAdminType, SuperAdmin, SuperAdminType, User, UserType, UserRole, UserRoleType, RolePermission, RolePermissionType } from './auth.model.js';
import { db } from '@/db/index';
import { eq, sql } from 'drizzle-orm';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
// JWT
import { verifyToken } from '@/features/jwt/jwt.controller.js';

class AuthRepositoryClass {

  constructor() {}

  // User
  // Get User by token
  async getUserDataByToken(token: string): Promise<UserType | null> {
    try {
      const decodedToken = verifyToken(token);

      if (!decodedToken.username) {
        throw new Error('(getUserByToken) Invalid token: username not found');
      }

      const loginType = decodedToken.loginType;
      let user: UserType | null = null;

      if (loginType === 'EMAIL') {
        user = await this.getUserByEmail(decodedToken.username);
      } else if (loginType === 'CONTACT_NO') {
        user = await this.getUserByContactNo(decodedToken.username);
      }

      return user ? user : null;
    } catch (error) {
      console.error('Error getting user from token:', error);
      return null;
    }
  }

  async getUserByEmail(email: string): Promise<UserType | null> { 
    const users = await db.select().from(User).where(eq(User.userEmail, email)).limit(1);
    return users.length > 0 && users[0].userId ? users[0] : null;
  }
  
  async getUserByContactNo(contactNo: string): Promise<UserType | null> {
    const users = await db.select().from(User).where(eq(User.userContactNo, contactNo)).limit(1);
    return users.length > 0 && users[0].userId ? users[0] : null;
  }

  async createUser(userData: UserType, tx?: PgTransaction<NodePgQueryResultHKT, Record<string, never>, ExtractTablesWithRelations<Record<string, never>>>): Promise<void> {
    if (!userData) {
      throw new Error('Create User: User data is required');
    }
    
    if (tx) {
      await tx.insert(User).values({
        ...userData,
        userId: sql`'USR_' || substr(gen_random_uuid()::text, 1, 32)`
      }).returning();
    }

    await db.insert(User).values({
      ...userData,
      userId: sql`'USR_' || substr(gen_random_uuid()::text, 1, 32)`
    }).returning();
  }
  // End User

  // Company Admin
  async getCompanyAdminDataByToken(token: string): Promise<CompanyAdminType | null> {
    try {
      const decodedToken = verifyToken(token);
      
      if (!decodedToken.username) {
        throw new Error('(getCompanyAdminByToken) Invalid token: username not found');
      }

      const loginType = decodedToken.loginType;
      let user: CompanyAdminType | null = null;

      if (loginType === 'EMAIL') {
        user = await this.getCompanyAdminByEmail(decodedToken.username);
      } else if (loginType === 'CONTACT_NO') {
        user = await this.getCompanyAdminByContactNo(decodedToken.username);
      }
      
      return user ? user : null;
    } catch (error) {
      console.error('Error getting company admin from token:', error);
      return null;
    }
  }

  async getCompanyAdminByEmail(email: string): Promise<CompanyAdminType | null> { 
    const companyAdmins = await db.select().from(CompanyAdmin).where(eq(CompanyAdmin.companyAdminEmail, email)).limit(1);
    return companyAdmins.length > 0 && companyAdmins[0].companyAdminId ? companyAdmins[0] : null;
  }

  async getCompanyAdminByContactNo(contact: string): Promise<CompanyAdminType | null> {
    const companyAdmins = await db.select().from(CompanyAdmin).where(eq(CompanyAdmin.companyAdminContactNo, contact)).limit(1);
    return companyAdmins.length > 0 && companyAdmins[0].companyAdminId ? companyAdmins[0] : null;
  }

  async createCompanyAdmin(userData: CompanyAdminType): Promise<void> {
    if (!userData) {
      throw new Error('Create Company Admin: User data is required');
    }
    
    await db.insert(CompanyAdmin).values(userData).returning();
  }
  // End Company Admin

  // Super Admin
  async getSuperAdminDataByToken(token: string): Promise<SuperAdminType | null> {
    try {
      const decodedToken = verifyToken(token);
      
      if (!decodedToken.username) {
        throw new Error('(getSuperAdminDataByToken) Invalid token: username not found');
      }

      const user = decodedToken.loginType === 'EMAIL' 
        ? await this.getSuperAdminByEmail(decodedToken.username) 
        : await this.getSuperAdminByContactNo(decodedToken.username);

      return user || null;
    } catch (error) {
      console.error('Error getting super admin from token:', error);
      return null;
    }
  }

  async getSuperAdminByEmail(email: string): Promise<SuperAdminType | null> { 
    const superAdmins = await db.select().from(SuperAdmin).where(eq(SuperAdmin.superAdminEmail, email)).limit(1);
    return superAdmins.length > 0 && superAdmins[0].superAdminId ? superAdmins[0] : null;
  }

  async getSuperAdminByContactNo(contact: string): Promise<SuperAdminType | null> {
    const superAdmins = await db.select().from(SuperAdmin).where(eq(SuperAdmin.superAdminContactNo, contact)).limit(1);
    return superAdmins.length > 0 && superAdmins[0].superAdminId ? superAdmins[0] : null;
  }
  // End Super Admin

  // User Role
  async getUserRoleByRoleId(roleId: string): Promise<UserRoleType | null> {
    const userRoles = await db.select().from(UserRole).where(eq(UserRole.roleId, roleId)).limit(1);
    return userRoles.length > 0 && userRoles[0].roleId ? userRoles[0] : null;
  }

  async getUserRole(roleName: string): Promise<UserRoleType | null> {
    const userRoles = await db.select().from(UserRole).where(eq(UserRole.roleName, roleName)).limit(1);
    return userRoles.length > 0 && userRoles[0].roleName ? userRoles[0] : null;
  }

  async createUserRole(userRoleData: UserRoleType): Promise<void> {
    if (!userRoleData) {
      throw new Error('Create User Role: User role data is required');
    }
    
    await db.insert(UserRole).values(userRoleData).returning();
  }

  async updateUserRole(userRoleData: Partial<UserRoleType>): Promise<void> {
    if (!userRoleData || !userRoleData.roleId) {
      throw new Error('Update User Role: User role data and roleId are required');
    }
    
    await db.update(UserRole)
      .set(userRoleData)
      .where(eq(UserRole.roleId, userRoleData.roleId))
      .returning();
  }
  // End User Role

  // Role Permission
  async createRolePermission(rolePermissionData: RolePermissionType): Promise<void> {
    if (!rolePermissionData) {
      throw new Error('Create Role Permission: Role permission data is required');
    }
    
    await db.insert(RolePermission).values(rolePermissionData).returning();
  }

  async updateRolePermission(rolePermissionData: Partial<RolePermissionType>): Promise<void> {
    if (!rolePermissionData || !rolePermissionData.permissionId) {
      throw new Error('Update Role Permission: Role permission data and permissionId are required');
    }
    
    await db.update(RolePermission)
      .set(rolePermissionData)
      .where(eq(RolePermission.permissionId, rolePermissionData.permissionId))
      .returning();
  }

  async getRolePermision(permissionName: string): Promise<RolePermissionType | null> { 
    const rolePermissions = await db.select().from(RolePermission).where(eq(RolePermission.permissionName, permissionName)).limit(1);
    return rolePermissions.length > 0 && rolePermissions[0].permissionName ? rolePermissions[0] : null;
  }

  async getRolePermissionByRoleId(roleId: string): Promise<string | null> {
    try {
      const result = await db.select({
        permissionId: UserRole.permissionId
      })
      .from(UserRole)
      .where(eq(UserRole.roleId, roleId))
      .execute();

      return result.length > 0 ? result[0].permissionId : null;
    } catch (error) {
      console.error('Error in getRolePermissionByRoleId:', error);
      throw error;
    }
  }
}

// Export an instance of the class
export const authRepository = new AuthRepositoryClass();

// Export individual methods for backward compatibility
export const getUserDataByToken = authRepository.getUserDataByToken.bind(authRepository);
export const getUserByEmail = authRepository.getUserByEmail.bind(authRepository);
export const getUserByContactNo = authRepository.getUserByContactNo.bind(authRepository);
export const createUser = authRepository.createUser.bind(authRepository);
export const getCompanyAdminDataByToken = authRepository.getCompanyAdminDataByToken.bind(authRepository);
export const getCompanyAdminByEmail = authRepository.getCompanyAdminByEmail.bind(authRepository);
export const getCompanyAdminByContactNo = authRepository.getCompanyAdminByContactNo.bind(authRepository);
export const createCompanyAdmin = authRepository.createCompanyAdmin.bind(authRepository);
export const getSuperAdminDataByToken = authRepository.getSuperAdminDataByToken.bind(authRepository);
export const getSuperAdminByEmail = authRepository.getSuperAdminByEmail.bind(authRepository);
export const getSuperAdminByContactNo = authRepository.getSuperAdminByContactNo.bind(authRepository);
export const getUserRoleByRoleId = authRepository.getUserRoleByRoleId.bind(authRepository);
export const getUserRole = authRepository.getUserRole.bind(authRepository);
export const createUserRole = authRepository.createUserRole.bind(authRepository);
export const updateUserRole = authRepository.updateUserRole.bind(authRepository);
export const createRolePermission = authRepository.createRolePermission.bind(authRepository);
export const updateRolePermission = authRepository.updateRolePermission.bind(authRepository);
export const getRolePermision = authRepository.getRolePermision.bind(authRepository);
export const getRolePermissionByRoleId = authRepository.getRolePermissionByRoleId.bind(authRepository);





