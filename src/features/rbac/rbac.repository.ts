import { logger } from "@/util/logger";
import { Role, RoleInsertType, RolePermission, RolePermissionInsertType, RolePermissionType, RoleType } from "./rbac.model";
import { DbTransaction } from "@/types/db-transaction";
import { db } from "@/db";

class RbacRepositoryClass {
    constructor() {}


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

    async createRolePermission(data: RolePermissionInsertType, tx?: DbTransaction): Promise<RolePermissionType> {
        try {
            const dbClient = tx || db;
            logger.info('ℹ️ [RbacRepository.createRolePermission] Creating role permission...');

            const [rolePermission] = await dbClient.insert(RolePermission).values(data).returning();

            logger.info('✅ [RbacRepository.createRolePermission] Role permission created successfully');
            return rolePermission;
        } catch (error) {
            logger.error('❌ [RbacRepository.createRolePermission] Error:', error);
            throw error;
        }
    }

    async createRolePermissions(data: RolePermissionInsertType[], tx?: DbTransaction): Promise<RolePermissionType[]> {
        try {
            const dbClient = tx || db;
            logger.info('ℹ️ [RbacRepository.createRolePermissions] Creating role permissions...');

            const rolePermissions = await dbClient.insert(RolePermission).values(data).returning();

            logger.info('✅ [RbacRepository.createRolePermissions] Role permissions created successfully');
            return rolePermissions;
        } catch (error) {
            logger.error('❌ [RbacRepository.createRolePermissions] Error:', error);
            throw error;
        }
    }
}

export { RbacRepositoryClass };