/**
 * RBAC GraphQL Resolvers
 * 
 * @description Resolver functions for Role-Based Access Control operations.
 * Uses RbacRepository for data access (proper layer separation).
 * 
 * Type definitions are in rbac.typeDefs.ts
 */

import { authRepository, rbacRepository } from '@/composition-root';
import { db } from '@/db';
import { RoleCode } from '@/features/rbac/rbac.model';

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Transform role for GraphQL response
 */
function transformRole(role: {
  roleId: string;
  roleName: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}, permissions: Array<{
  id: string;
  permissionId: string;
  permissionType: string;
  moduleId: string;
  moduleName: string;
}>) {
  return {
    roleId: role.roleId,
    roleName: role.roleName,
    status: role.status,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
    createdBy: role.createdBy,
    updatedBy: role.updatedBy,
    permissions,
  };
}

/**
 * Transform module for GraphQL response
 */
function transformModule(module: {
  id: string;
  moduleName: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  permissionId: string;
  permissionType: string;
  description: string | null;
}) {
  return {
    moduleId: module.id,
    moduleName: module.moduleName,
    status: module.status,
    createdAt: module.createdAt.toISOString(),
    updatedAt: module.updatedAt.toISOString(),
    createdBy: module.createdBy,
    updatedBy: module.updatedBy,
  };
}

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  Query: {
    /**
     * Get all roles with their permissions (uses repository)
     */
    roles: async () => {
      const result = await rbacRepository.getRole({}, { pageSize: 1000, pageNumber: 1 });
      
      // Get permissions for each role
      const rolesWithPermissions = await Promise.all(
        result.query.map(async (role: any) => {
          const permissions = await rbacRepository.getRolePermission({ roleId: role.roleId });
          return transformRole(role, permissions);
        })
      );

      return rolesWithPermissions;
    },

    /**
     * Get a single role by ID (uses repository)
     */
    role: async (_: unknown, { id }: { id: string }) => {
      const result = await rbacRepository.getRole({ roleId: id }, { pageSize: 1, pageNumber: 1 });
      
      if (result.query.length === 0) return null;
      
      const role = result.query[0];
      const permissions = await rbacRepository.getRolePermission({ roleId: id });
      
      return transformRole(role, permissions);
    },

    /**
     * Get all modules with their permissions (uses repository)
     */
    modules: async () => {
      const modules = await rbacRepository.getModule({});
      
      // Group by module and collect permissions
      const moduleMap = new Map<string, {
        moduleId: string;
        moduleName: string;
        status: string;
        createdAt: string;
        updatedAt: string;
        createdBy: string;
        updatedBy: string;
        permissions: Array<{
          permissionId: string;
          moduleId: string;
          permissionType: string;
          description: string | null;
          status: string;
          createdAt: string;
          updatedAt: string;
          createdBy: string;
          updatedBy: string;
        }>;
      }>();

      for (const row of modules) {
        const existing = moduleMap.get(row.id);

        if (existing) {
          // Only push permission if the left join produced a real row (not null)
          if (row.permissionId) {
            existing.permissions.push({
              permissionId: row.permissionId,
              moduleId: row.id,
              permissionType: row.permissionType!,
              description: row.description,
              status: row.status,
              createdAt: row.createdAt.toISOString(),
              updatedAt: row.updatedAt.toISOString(),
              createdBy: row.createdBy,
              updatedBy: row.updatedBy,
            });
          }
        } else {
          moduleMap.set(row.id, {
            moduleId: row.id,
            moduleName: row.moduleName,
            status: row.status,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            createdBy: row.createdBy,
            updatedBy: row.updatedBy,
            permissions: row.permissionId ? [{
              permissionId: row.permissionId,
              moduleId: row.id,
              permissionType: row.permissionType!,
              description: row.description,
              status: row.status,
              createdAt: row.createdAt.toISOString(),
              updatedAt: row.updatedAt.toISOString(),
              createdBy: row.createdBy,
              updatedBy: row.updatedBy,
            }] : [],
          });
        }
      }

      return Array.from(moduleMap.values());
    },

    /**
     * Get all permissions (uses repository)
     */
    permissions: async () => {
      const result = await rbacRepository.getPermission({}, { pageSize: 1000, pageNumber: 1 });
      
      return result.query.map((p: any) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }));
    },

    /**
     * Get permissions for a specific role (uses repository)
     */
    rolePermissions: async (_: unknown, { roleId }: { roleId: string }) => {
      return rbacRepository.getRolePermission({ roleId });
    },

    /**
     * Get all user role assignments (uses repository)
     */
    userRoles: async () => {
      const result = await rbacRepository.getUserRole({}, { pageSize: 1000, pageNumber: 1 });
      
      return result.query.map((r: any) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }));
    },
  },

  Mutation: {
    /**
     * Create a new module (uses repository) — also auto-creates default permissions
     */
    createModule: async (_: unknown, { input }: { input: {
      moduleName: string;
      status?: string;
      createdBy: string;
      updatedBy: string;
    }}) => {
      const defaultPermissionTypes = ['Read', 'Create', 'Update', 'Delete', 'Approve'];

      const { module, createdPermissions } = await db.transaction(async (tx) => {
        const module = await rbacRepository.createModule({
          moduleName: input.moduleName,
          status: input.status || 'active',
          createdBy: input.createdBy,
          updatedBy: input.updatedBy,
        }, tx);

        const createdPermissions = await Promise.all(
          defaultPermissionTypes.map((permissionType) =>
            rbacRepository.createPermission({
              moduleId: module.moduleId,
              permissionType,
              status: 'active',
              createdBy: input.createdBy,
              updatedBy: input.updatedBy,
            }, tx)
          )
        );

        // Auto-assign all new permissions to Super Admin role
        const superAdminRole = await authRepository.getRoleByName(RoleCode.SUPER_ADMIN);
        if (superAdminRole) {
          await rbacRepository.createRolePermission(
            createdPermissions.map((p) => ({
              roleId: superAdminRole.roleId,
              permissionId: p.permissionId,
              createdBy: input.createdBy,
              updatedBy: input.updatedBy,
            })),
            tx
          );
        }

        return { module, createdPermissions };
      });

      return {
        moduleId: module.moduleId,
        moduleName: module.moduleName,
        status: module.status,
        createdAt: module.createdAt.toISOString(),
        updatedAt: module.updatedAt.toISOString(),
        createdBy: module.createdBy,
        updatedBy: module.updatedBy,
        permissions: createdPermissions.map((p) => ({
          permissionId: p.permissionId,
          moduleId: p.moduleId,
          permissionType: p.permissionType,
          description: p.description ?? null,
          status: p.status,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
          createdBy: p.createdBy,
          updatedBy: p.updatedBy,
        })),
      };
    },

    /**
     * Update an existing module (uses repository)
     */
    updateModule: async (_: unknown, { id, input }: { id: string; input: {
      moduleName?: string;
      status?: string;
      updatedBy: string;
    }}) => {
      const updateData: Record<string, unknown> = {
        updatedBy: input.updatedBy,
        updatedAt: new Date(),
      };

      if (input.moduleName !== undefined) updateData.moduleName = input.moduleName;
      if (input.status !== undefined) updateData.status = input.status;

      const module = await rbacRepository.updateModule(updateData, id);
      if (!module) return null;

      const rows = await rbacRepository.getModule({ moduleId: module.moduleId });
      const permissions = rows
        .filter((r: any) => r.permissionId)
        .map((r: any) => ({
          permissionId: r.permissionId,
          moduleId: module.moduleId,
          permissionType: r.permissionType,
          description: r.description,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
          createdBy: r.createdBy,
          updatedBy: r.updatedBy,
        }));

      return {
        moduleId: module.moduleId,
        moduleName: module.moduleName,
        status: module.status,
        createdAt: module.createdAt.toISOString(),
        updatedAt: module.updatedAt.toISOString(),
        createdBy: module.createdBy,
        updatedBy: module.updatedBy,
        permissions,
      };
    },

    /**
     * Create a new role (uses repository)
     */
    createRole: async (_: unknown, { input }: { input: {
      roleName: string;
      status?: string;
      createdBy: string;
      updatedBy: string;
    }}) => {
      const role = await rbacRepository.createRole({
        roleName: input.roleName,
        status: input.status || 'active',
        createdBy: input.createdBy,
        updatedBy: input.updatedBy,
      });

      return {
        ...role,
        createdAt: role.createdAt.toISOString(),
        updatedAt: role.updatedAt.toISOString(),
        permissions: [],
      };
    },

    /**
     * Update an existing role (uses repository)
     */
    updateRole: async (_: unknown, { id, input }: { id: string; input: {
      roleName?: string;
      status?: string;
      updatedBy: string;
    }}) => {
      const updateData: Record<string, unknown> = {
        updatedBy: input.updatedBy,
      };

      if (input.roleName !== undefined) updateData.roleName = input.roleName;
      if (input.status !== undefined) updateData.status = input.status;

      const role = await rbacRepository.updateRole(updateData, id);
      
      if (!role) return null;

      const permissions = await rbacRepository.getRolePermission({ roleId: role.roleId });
      return transformRole(role, permissions);
    },
  },

  RbacRole: {
    /**
     * Resolve permissions field for RbacRole type
     */
    permissions: async (parent: { roleId: string; permissions?: Array<unknown> }) => {
      if (parent.permissions) return parent.permissions;
      return rbacRepository.getRolePermission({ roleId: parent.roleId });
    },
  },
};
