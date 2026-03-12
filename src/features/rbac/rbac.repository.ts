import { logger } from "@/util/logger";
import { Permission, Module, Role, RoleInsertType, RolePermission, RolePermissionInsertType, RolePermissionType, RoleType, UserRole, UserRoleInsertType, UserRoleType, UserRoleFilter, RoleFilter, ModuleFilter, PermissionFilter, PermissionInsertType, PermissionType, RolePermissionFilter, ModuleWithPermissionType, ModuleType, PaginationParams, PaginatedResponse, ModuleInsertType, RolePermissionUpdateType } from "./rbac.model";
import { DbTransaction } from "@/types/db-transaction";
import { db } from "@/db";
import z from "zod";
import { eq, and, like, inArray } from "drizzle-orm";
import { pagination, PgQueryType } from "@/util/pagination";
import { UsersTable } from "../auth/auth.model";

// Filter schema for RBAC
export const rbacFilter = z.object({
  roleId: z.string().optional(),
  roleName: z.string().optional(),
  memberId: z.string().optional(),
  moduleId: z.string().optional(),
  memberName: z.string().optional(),
  status: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  excludeMemberId: z.string().optional(),
  pageSize: z.string().optional(),
  pageNumber: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  searchMemberName: z.string().optional(),
  approvalStatus: z.string().optional()
});

export type RbacFilter = z.infer<typeof rbacFilter>;

export type UserRoleWithPermissionType = {
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

class RbacRepositoryClass {
    constructor() {}

    /* Get User Role is at auth  */

    /* 
        TODO: 
        // User Role Operations
(Done) getUserRoleWithPermission - get user role with permission 
(Done) createUserRole - create user role
(Done) updateUserRole - update user role
        // Role Operations
(Done) getRole - Get All data from role table
(Done) createRole - create role
(Done) updateRole - Updates an existing role in the database
        // Module Operations
(Done) getModule - Get All data from module table
(Done) createModule - create module
(Done) updateModule - update module
        // Permission Operations
(Done) getPermission - Get All data from permission table
(Done) createPermission - create permission
(Done) updatePermission - update permission
        // Role Permission Operations
(Done) getRolePermission - Get All data from role permission table
(Done) createRolePermission - create role permission
(Done) updateRolePermission - update role permission
    */

    async getUserRoleWithPermission(userId: string): Promise<UserRoleWithPermissionType[]> {
        try {
            logger.info('ℹ️ [RbacRepository.getUserRoleWithPermission] Getting user role with permission...');
            const userRole = 
                await db
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
                    .where(
                        and(
                            eq(UserRole.status, 'active'),
                            eq(UserRole.userId, userId)
                        )
                    )
                    .orderBy(Module.moduleName);

            logger.info('✅ [RbacRepository.getUserRoleWithPermission] User role with permission fetched successfully');
            return userRole;
        } catch (error) {
            logger.error('❌ [RbacRepository.getUserRoleWithPermission] Error:', error);
            throw error;
        }
    }

    /**
     * Gets user roles from the database with optional filtering
     * @param filter - The filter object
     * @param paginationParams - Pagination parameters
     * @returns Paginated array of user roles with role details
     */
    async getUserRole(filter: UserRoleFilter, paginationParams: PaginationParams): Promise<PaginatedResponse<any>> {
        try {
            logger.info('ℹ️ [RbacRepository.getUserRole] Getting user roles...');
            logger.debug('Filter:', filter);

            let whereCondition = [];

            if (Array.isArray(filter.id)) {
                whereCondition.push(inArray(UserRole.id, filter.id));
            } else if (filter.id) {
                whereCondition.push(eq(UserRole.id, filter.id));
            }

            if (Array.isArray(filter.userId)) {
                whereCondition.push(inArray(UserRole.userId, filter.userId));
            } else if (filter.userId) {
                whereCondition.push(eq(UserRole.userId, filter.userId));
            }

            if (Array.isArray(filter.roleId)) {
                whereCondition.push(inArray(UserRole.roleId, filter.roleId));
            } else if (filter.roleId) {
                whereCondition.push(eq(UserRole.roleId, filter.roleId));
            }

            if (filter.status) {
                whereCondition.push(eq(UserRole.status, filter.status));
            }

            const baseQuery = db
                .select({
                    id: UserRole.id,
                    userId: UserRole.userId,
                    userName: UsersTable.displayName,
                    roleId: UserRole.roleId,
                    roleName: Role.roleName,
                    status: UserRole.status,
                    createdAt: UserRole.createdAt,
                    updatedAt: UserRole.updatedAt,
                    createdBy: UserRole.createdBy,
                    updatedBy: UserRole.updatedBy,
                })
                .from(UserRole)
                .innerJoin(Role, eq(UserRole.roleId, Role.roleId))
                .innerJoin(UsersTable, eq(UserRole.userId, UsersTable.id))
                .where(and(...whereCondition));

            const pageSize = paginationParams.pageSize || 10;
            const pageNumber = paginationParams.pageNumber || 1;
            const totalCount = (await baseQuery).length;
            const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
            const data = await paginatedQuery.query;

            logger.info('✅ [RbacRepository.getUserRole] User roles fetched successfully');
            return { query: data, pagination: paginatedQuery.pagination };
        } catch (error) {
            logger.error('❌ [RbacRepository.getUserRole] Error:', error);
            throw error;
        }
    }

    async createUserRole(data: UserRoleInsertType[], tx?: DbTransaction): Promise<UserRoleType[]> {
        try {
            logger.info('ℹ️ [RbacRepository.createUserRole] Creating user role...');
            const dbClient = tx || db;
            const userRoles = await dbClient
                .insert(UserRole)
                .values(
                    data.map(userRole => ({
                        ...userRole,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    }))
                )
                .returning();

            logger.info('✅ [RbacRepository.createUserRole] User role created successfully');
            return userRoles;

        } catch (error) {
            logger.error('❌ [RbacRepository.createUserRole] Error:', error);
            throw new Error("[RbacRepository.createUserRole] Error creating user role");
        }
    }

    async updateUserRole(data: Partial<UserRoleInsertType>, id: string, tx?: DbTransaction): Promise<UserRoleType> {
        try {
            const dbClient = tx || db;
            logger.info('ℹ️ [RbacRepository.updateUserRole] Updating user role...');

            const [userRole] = await dbClient.update(UserRole).set({
                ...data,
                updatedAt: new Date(),
            })
            .where(eq(UserRole.id, id))
            .returning();

            logger.info('✅ [RbacRepository.updateUserRole] User role updated successfully');
            return userRole;
        } catch (error) {
            logger.error('❌ [RbacRepository.updateUserRole] Error:', error);
            throw error;
        }
    }

    // End of User Role  

    // Start of Role Operations
    /**
     * Gets roles from the database with optional filtering
     * @param filter - The filter object
     * @param paginationParams - Pagination parameters
     * @returns Paginated array of roles
     */
    async getRole(filter: RoleFilter, paginationParams: PaginationParams): Promise<PaginatedResponse<any>> {
        try {

            logger.info('ℹ️ [RbacRepository.getRole] Getting role...');

            let whereCondition = [];

            if (filter.roleId) {
                whereCondition.push(eq(Role.roleId, filter.roleId));
            }

            if (filter.roleName) {
                whereCondition.push(like(Role.roleName, `%${filter.roleName}%`));
            }

            if (filter.status) {
                whereCondition.push(eq(Role.status, filter.status));
            }

            const baseQuery = db.select().from(Role).where(and(...whereCondition));
            
            const pageSize = paginationParams.pageSize || 10;
            const pageNumber = paginationParams.pageNumber || 1;
            const totalCount = (await baseQuery).length;
            const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
            const data = await paginatedQuery.query;

            logger.info('✅ [RbacRepository.getRole] Roles fetched successfully');
            return { query: data, pagination: paginatedQuery.pagination };
        } catch (error) {
            logger.error('❌ [RbacRepository.getRole] Error:', error);
            throw error;
        }
    }

    /**
     * Creates a new role in the database
     * @param roleData - The role data to create
     * @param tx - Optional transaction object for batch operations
     * @returns The created role object
    */
    async createRole(roleData: RoleInsertType, tx?: DbTransaction): Promise<RoleType> {
        try {

            const dbClient = tx || db;
            logger.info('ℹ️ [RbacRepository.createRole] Creating role...');

            const [role] = await dbClient.insert(Role).values({
                ...roleData,
                createdAt: new Date(),
                updatedAt: new Date(),
            }).returning();

            logger.info('✅ [RbacRepository.createRole] Role created successfully');
            return role;
        } catch (error) {
            logger.error('❌ [RbacRepository.createRole] Error:', error);
            throw error;
        }
    }

    /**
     * Updates an existing role in the database
     * @param data - The role data to update
     * @param roleId - The unique identifier of the role to update
     * @param tx - Optional transaction object for batch operations
     * @returns The updated role object
    */
    async updateRole(data: Partial<RoleInsertType>, id: string, tx?: DbTransaction): Promise<RoleType> {
        try {
            const dbClient = tx || db;
            logger.info('ℹ️ [RbacRepository.updateRole] Updating role...');
            const [role] = await dbClient.update(Role).set({
                ...data,
                updatedAt: new Date(),
            }).where(eq(Role.roleId, id)).returning();
            return role;
        }
        catch (error) {
            logger.error('❌ [RbacRepository.updateRole] Error:', error);
            throw new Error("[RbacRepository.updateRole] Error updating role");
        }
    }

    // End of Role Operations

    // Start of Module Operations
    
    /**
     * Gets modules from the database
     * @param filter - The filter object
     * @returns The modules
    */
    async getModule(filter: ModuleFilter): Promise<any[]> {
        try {
            logger.info('ℹ️ [RbacRepository.getModule] Getting module...');
            logger.debug('Filter:', filter);

            let whereCondition = [];

            if (filter.moduleId) {
                whereCondition.push(eq(Module.moduleId, filter.moduleId));
            }

            if (filter.moduleName) {
                whereCondition.push(like(Module.moduleName, `%${filter.moduleName}%`));
            }

            if (filter.status) {
                whereCondition.push(eq(Module.status, filter.status));
            }

            const modules =
                await db
                    .select({
                        id: Module.moduleId,
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
                    .leftJoin(Permission, eq(Module.moduleId, Permission.moduleId))
                    .where(and(...whereCondition))
                    .orderBy(Module.moduleName);

            logger.info('✅ [RbacRepository.getModule] Module fetched successfully');
            return modules;
        } catch (error) {
            logger.error('❌ [RbacRepository.getModule] Error:', error);
            throw error;
        }
    }

    async createModule(data: ModuleInsertType, tx?: DbTransaction): Promise<ModuleType> {
        try {
            const dbClient = tx || db;
            logger.info('ℹ️ [RbacRepository.createModule] Creating module...');
            const [module] = await dbClient.insert(Module).values(data).returning();
            logger.info('✅ [RbacRepository.createModule] Module created successfully');
            return module;
        } catch (error) {
            logger.error('❌ [RbacRepository.createModule] Error:', error);
            throw error;
        }
    }

    async updateModule(data: Partial<ModuleInsertType>, id: string, tx?: DbTransaction): Promise<ModuleType> {
        try {
            const dbClient = tx || db;
            logger.info('ℹ️ [RbacRepository.updateModule] Updating module...');
            const [module] = await dbClient.update(Module).set(data).where(eq(Module.moduleId, id)).returning();
            logger.info('✅ [RbacRepository.updateModule] Module updated successfully');
            return module;
        } catch (error) {
            logger.error('❌ [RbacRepository.updateModule] Error:', error);
            throw error;
        }
    }

    // End of Module Operations

    // Start of Permission Operations
    /**
     * Gets permissions from the database
     * @param filter - The filter object
     * @param paginationParams - Pagination parameters
     * @returns Paginated permissions
    */
    async getPermission(filter: PermissionFilter, paginationParams: PaginationParams): Promise<PaginatedResponse<any>> {
        try {
            logger.info('ℹ️ [RbacRepository.getPermission] Getting permission...');
            logger.debug('Filter:', filter);

            let whereCondition = [];

            if (Array.isArray(filter.permissionId)) {
                whereCondition.push(inArray(Permission.permissionId, filter.permissionId));
            } else if (filter.permissionId) {
                whereCondition.push(eq(Permission.permissionId, filter.permissionId));
            }

            if (Array.isArray(filter.moduleId)) {
                whereCondition.push(inArray(Permission.moduleId, filter.moduleId));
            } else if (filter.moduleId) {
                whereCondition.push(eq(Permission.moduleId, filter.moduleId));
            }

            if (filter.permissionType) {
                whereCondition.push(eq(Permission.permissionType, filter.permissionType));
            }

            if (filter.status) {
                whereCondition.push(eq(Permission.status, filter.status));
            }

            const baseQuery = db.select().from(Permission).where(and(...whereCondition));
            
            const pageSize = paginationParams.pageSize || 10;
            const pageNumber = paginationParams.pageNumber || 1;
            const totalCount = (await baseQuery).length;
            const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
            const data = await paginatedQuery.query;

            logger.info('✅ [RbacRepository.getPermission] Permission fetched successfully');
            return { query: data, pagination: paginatedQuery.pagination };
        }
        catch (error) {
            logger.error('❌ [RbacRepository.getPermission] Error:', error);
            throw error;
        }
    }

    /**
     * Creates a new permission in the database
     * @param data - The permission data to create
     * @param tx - Optional transaction object for batch operations
     * @returns The created permission object
    */
    async createPermission(data: PermissionInsertType, tx?: DbTransaction): Promise<PermissionType> {
        try {
            const dbClient = tx || db;
            logger.info('ℹ️ [RbacRepository.createPermission] Creating permission...');
            const [permission] = await dbClient.insert(Permission).values(data).returning();
            logger.info('✅ [RbacRepository.createPermission] Permission created successfully');
            return permission;
        } catch (error) {
            logger.error('❌ [RbacRepository.createPermission] Error:', error);
            throw error;
        }
    }

    /**
     * Updates an existing permission in the database
     * @param data - The permission data to update
     * @param id - The unique identifier of the permission to update
     * @param tx - Optional transaction object for batch operations
     * @returns The updated permission object
    */
    async updatePermission(data: PermissionInsertType, id: string, tx?: DbTransaction): Promise<PermissionType> {
        try {
            const dbClient = tx || db;
            logger.info('ℹ️ [RbacRepository.updatePermission] Updating permission...');
            const [permission] = await dbClient.update(Permission).set(data).where(eq(Permission.permissionId, id)).returning();
            logger.info('✅ [RbacRepository.updatePermission] Permission updated successfully');
            return permission;
        }
        catch (error) {
            logger.error('❌ [RbacRepository.updatePermission] Error:', error);
            throw new Error("[RbacRepository.updatePermission] Error updating permission");
        }
    }

    // End of Permission Operations

    
    // Start of Role Permission Operations

    /**
     * Gets role permissions from the database
     * @param filter - The filter object
     * @returns The role permissions
    */
    async getRolePermission(filter: RolePermissionFilter): Promise<any[]> {
        try {
            logger.info('ℹ️ [RbacRepository.getRolePermission] Getting role permission...');
            logger.debug('Filter:', filter);

            let whereCondition = [];

            if (filter.roleId) {
                whereCondition.push(eq(RolePermission.roleId, filter.roleId));
            }
            
            if (filter.permissionId) {
                whereCondition.push(eq(RolePermission.permissionId, filter.permissionId));
            }

            const rolePermissions = await 
                db.select({
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
                .where(and(...whereCondition));
            
            logger.info('✅ [RbacRepository.getRolePermission] Role permission fetched successfully');
            return rolePermissions;
        }
        catch (error) {
            logger.error('❌ [RbacRepository.getRolePermission] Error:', error);
            throw error;
        }
    }

    /**
     * Creates a new role permission in the database
     * @param data - The role permission data to create
     * @param tx - Optional transaction object for batch operations
     * @returns The created role permission object
    */
   
    async createRolePermission(data: RolePermissionInsertType | RolePermissionInsertType[], tx?: DbTransaction): Promise<RolePermissionType> {
        try {
            const dbClient = tx || db;
            logger.info('ℹ️ [RbacRepository.createRolePermission] Creating role permission...');

            if (!Array.isArray(data)) {
                data = [data];
            }

            const [rolePermission] = await dbClient.insert(RolePermission).values(data).returning();

            logger.info('✅ [RbacRepository.createRolePermission] Role permission created successfully');
            return rolePermission;
        } catch (error) {
            logger.error('❌ [RbacRepository.createRolePermission] Error:', error);
            throw error;
        }
    }

    /**
     * Syncs role permissions using diff approach - only deletes/inserts what's necessary
     * @param data - Contains permissionIds array and updatedBy
     * @param roleId - The role ID to update permissions for
     * @param tx - Optional transaction object for batch operations
     * @returns Array of all current role permission records after sync
    */
    async updateRolePermission(data: RolePermissionUpdateType, roleId: string, tx?: DbTransaction): Promise<RolePermissionType[]> {
        try {
            logger.info('ℹ️ [RbacRepository.updateRolePermission] Syncing role permissions...');
            logger.debug('Data:', { roleId, permissionIds: data.permissionIds });

            const result = await db.transaction(async (localTx) => {
                const dbClient = tx || localTx;

                // Step 1: Get existing permissions for this role
                const existingPermissions = await dbClient
                    .select({ permissionId: RolePermission.permissionId, id: RolePermission.id })
                    .from(RolePermission)
                    .where(eq(RolePermission.roleId, roleId));

                const existingPermissionIds = existingPermissions.map(p => p.permissionId);
                const newPermissionIds = data.permissionIds;

                // Step 2: Find permissions to delete (exist in DB but not in new list)
                const toDelete = existingPermissions
                    .filter(p => !newPermissionIds.includes(p.permissionId))
                    .map(p => p.id);

                // Step 3: Find permissions to add (in new list but not in DB)
                const toAdd = newPermissionIds.filter(id => !existingPermissionIds.includes(id));

                logger.debug('Diff:', { existingCount: existingPermissionIds.length, toDelete: toDelete.length, toAdd: toAdd.length });

                // Step 4: Delete removed permissions
                if (toDelete.length > 0) {
                    await dbClient
                        .delete(RolePermission)
                        .where(inArray(RolePermission.id, toDelete));
                }

                // Step 5: Insert new permissions
                if (toAdd.length > 0) {
                    await dbClient
                        .insert(RolePermission)
                        .values(
                            toAdd.map((permissionId) => ({
                                roleId,
                                permissionId,
                                createdBy: data.createdBy || data.updatedBy,
                                updatedBy: data.updatedBy,
                            }))
                        );
                }

                // Step 6: Return all current permissions for this role
                const currentPermissions = await dbClient
                    .select()
                    .from(RolePermission)
                    .where(eq(RolePermission.roleId, roleId));

                return currentPermissions;
            });

            logger.info('✅ [RbacRepository.updateRolePermission] Role permissions synced successfully, count:', result.length);
            return result;
        } catch (error) {
            logger.error('❌ [RbacRepository.updateRolePermission] Error:', error);
            throw new Error("[RbacRepository.updateRolePermission] Error updating role permission");
        }
    }


    // End of Role Permission Operations

    async getModuleByName(moduleName: string): Promise<ModuleType> {
        try {
            logger.info('ℹ️ [RbacRepository.getModuleByName] Getting module by name...');
            const [module] = await db.select().from(Module).where(eq(Module.moduleName, moduleName));
            logger.info('✅ [RbacRepository.getModuleByName] Module fetched successfully');
            return module;
        } catch (error) {
            logger.error('❌ [RbacRepository.getModuleByName] Error:', error);
            throw error;
        }
    }

}

export { RbacRepositoryClass };