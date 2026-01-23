/**
 * RBAC Controller
 * 
 * @description Handles Role-Based Access Control HTTP requests.
 * All request data is validated using Zod schemas before being passed to the repository.
 */

import { Request, Response } from 'express';
import { AuthRepositoryClass, RoleInsertType } from '@/features/auth/auth.repository.js';
import { Error } from '@/error/index.js';
import { logger } from '@/util/logger.js';
import z, { prettifyError } from 'zod';
import { db } from '@/db';
import { RbacRepositoryClass } from './rbac.repository';
import { ModuleGroupType, ModuleWithPermissionType, RolePermissionGroupType } from './rbac.model';

class RbacControllerClass {
  constructor(
    private authRepository: AuthRepositoryClass,
    private rbacRepository: RbacRepositoryClass
  ) {}

  // ============================================
  // USER ACCESS
  // ============================================

  /**
   * Get All User Access
   * GET /rbac
   * 
   * @description Returns all access permissions for the authenticated user.
   */
  async getAllUserAccess(req: Request, res: Response): Promise<void> {
    try {
      logger.info('ℹ️ [RbacController.getAllUserAccess] Fetching user access...');
      
      // TODO: Implement user access retrieval using this.authRepository
      // Example: const permissions = await this.authRepository.getPermissionsByRoleId(roleId);

      logger.info('✅ [RbacController.getAllUserAccess] User access fetched successfully');

      res.status(200).json({
        success: true,
        message: 'User access fetched successfully',
        data: []
      });
    } catch (error) {
      logger.error('❌ [RbacController.getAllUserAccess] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null
      });
    }
  }

  // ============================================
  // USER ROLE OPERATIONS
  // ============================================

  /**
   * Get User Roles
   * GET /rbac/user-role
   * 
   * @description Returns user roles based on query filters.
   * @query userId - Filter by user ID
   * @query roleId - Filter by role ID
   * @query status - Filter by status
   */
  async getUserRole(req: Request, res: Response): Promise<void> {
    try {
      logger.info('ℹ️ [RbacController.getUserRole] Fetching user roles...');
      
      const filterSchema = z.object({
        id: z.uuid().optional(),
        userId: z.uuid().optional(),
        roleId: z.uuid().optional(),
        status: z.string().max(20).optional(),
      }).default({});

      const { success, data: filter, error } = filterSchema.safeParse(req.query);

      if (!success) {
        logger.warn('⚠️ [RbacController.getUserRole] Validation failed:', prettifyError(error));
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: prettifyError(error),
        });
        return;
      }

      const userRoles = await this.rbacRepository.getUserRole(filter);

      logger.info('✅ [RbacController.getUserRole] User roles fetched successfully, count:', userRoles.length);

      res.status(200).json({
        success: true,
        message: 'User role fetched successfully',
        data: userRoles
      });
    } catch (error) {
      logger.error('❌ [RbacController.getUserRole] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null
      });
    }
  }

  /**
   * Create User Role
   * POST /rbac/user-role/create
   * 
   * @description Creates a new user role assignment.
   * @body userId - The user ID to assign the role to
   * @body roleId - The role ID to assign
   * @body status - The status of the assignment (default: 'active')
   */
  async createUserRole(req: Request, res: Response): Promise<void> {
    try {
      logger.info('ℹ️ [RbacController.createUserRole] Creating user role...');
      logger.debug('🔍 [RbacController.createUserRole] Request body:', req.body);

      const createSchema = z.object({
        userId: z.uuid('Invalid user ID format'),
        roleId: z.uuid('Invalid role ID format'),
        status: z.string().max(20).default('active'),
        createdBy: z.string().max(40).default('system'),
        updatedBy: z.string().max(40).default('system'),
      });

      const createArraySchema = z.union([createSchema, z.array(createSchema)]);

      const { success, data, error } = createArraySchema.safeParse(req.body);

      if (!success) {
        logger.warn('⚠️ [RbacController.createUserRole] Validation failed:', prettifyError(error));
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: prettifyError(error),
        });
        return;
      }

      const normalizedData = Array.isArray(data) ? data : [data];

      const userRoles = await this.rbacRepository.createUserRole(normalizedData);

      logger.info('✅ [RbacController.createUserRole] User role created successfully');

      res.status(201).json({
        success: true,
        message: 'User role created successfully',
        data: userRoles
      });
    } catch (error) {
      logger.error('❌ [RbacController.createUserRole] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null
      });
    }
  }

  /**
   * Update User Role
   * PUT /rbac/user-role/update/:userRoleId
   * 
   * @description Updates an existing user role assignment.
   * @param userRoleId - The user role ID to update
   * @body roleId - The new role ID (optional)
   * @body status - The new status (optional)
   */
  async updateUserRole(req: Request, res: Response): Promise<void> {
    try {
      logger.info('ℹ️ [RbacController.updateUserRole] Updating user role...');
      logger.debug('🔍 [RbacController.updateUserRole] Request body:', req.body);

      const paramsSchema = z.object({
        userRoleId: z.uuid('Invalid user role ID format'),
      });

      const paramsResult = paramsSchema.safeParse(req.params);
      if (!paramsResult.success) {
        logger.warn('⚠️ [RbacController.updateUserRole] Invalid params:', prettifyError(paramsResult.error));
        res.status(400).json({
          success: false,
          message: 'Invalid user role ID',
          errors: prettifyError(paramsResult.error),
        });
        return; 
      }

      const updateSchema = z.object({
        roleId: z.uuid('Invalid role ID format').optional(),
        status: z.string().max(20).optional(),
        updatedBy: z.string().max(40).default('system'),
      });

      const { success, data, error } = updateSchema.safeParse(req.body);

      if (!success) {
        logger.warn('⚠️ [RbacController.updateUserRole] Validation failed:', prettifyError(error));
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: error.issues,
        });
        return;
      }

      const userRole = await this.rbacRepository.updateUserRole(data, paramsResult.data.userRoleId);

      logger.info('✅ [RbacController.updateUserRole] User role updated successfully');

      res.status(200).json({
        success: true,
        message: 'User role updated successfully',
        data: userRole
      });
    } catch (error) {
      logger.error('❌ [RbacController.updateUserRole] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null
      });
    }
  }

  // ============================================
  // ROLE OPERATIONS
  // ============================================

  /**
   * Get All Roles
   * GET /rbac/roles
   * 
   * @description Returns all roles in the system with optional filtering.
   * @query roleId - Filter by role ID
   * @query roleName - Filter by role name (partial match)
   * @query status - Filter by status
   */
  async getAllRoles(req: Request, res: Response): Promise<void> {
    try {
      logger.info('ℹ️ [RbacController.getAllRoles] Fetching all roles...');

      const filterSchema = z.object({
        roleId: z.uuid().optional(),
        roleName: z.string().max(50).optional(),
        status: z.string().max(20).optional(),
      });

      const { success, data: filter, error } = filterSchema.safeParse(req.query);

      if (!success) {
        logger.warn('⚠️ [RbacController.getAllRoles] Validation failed:', prettifyError(error));
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: error.issues,
        });
        return;
      }

      const roles = await this.rbacRepository.getRole(filter);

      logger.info('✅ [RbacController.getAllRoles] Roles fetched successfully, count:', roles.length);

      res.status(200).json({
        success: true,
        message: 'Role fetched successfully',
        count: roles.length,
        data: roles
      });
    } catch (error) {
      logger.error('❌ [RbacController.getAllRoles] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null
      });
    }
  }

  /**
   * Create Role
   * POST /rbac/roles/create
   * 
   * @description Creates a new role in the system with optional permission assignments.
   * @body roleName - The role name (required)
   * @body status - The role status (default: 'active')
   * @body permissionIds - Array of permission IDs to assign (optional)
   */
  async createRole(req: Request, res: Response): Promise<void> {
    try {
      logger.info('ℹ️ [RbacController.createRole] Request received for creating new role...');
      logger.debug('🔍 [RbacController.createRole] Request body:', req.body);

      const roleCreateSchema = z.object({
        roleName: z.string().min(1, 'Role name is required').max(50),
        status: z.string().max(20).default('active'),
        permissionIds: z.array(z.uuid()).default([]),
        createdBy: z.string().max(40).default('system'),
        updatedBy: z.string().max(40).default('system'),
      });

      const { success, data, error } = roleCreateSchema.safeParse(req.body);

      if (!success) {
        logger.warn('⚠️ [RbacController.createRole] Validation failed:', prettifyError(error));
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: prettifyError(error),
        });
        return;
      }

      logger.info('ℹ️ [RbacController.createRole] Request body validated successfully, creating new role...');

      const result = await db.transaction(async (tx) => {
        const roleData: RoleInsertType = {
          roleName: data.roleName,
          status: data.status,
          createdBy: data.createdBy,
          updatedBy: data.updatedBy,
        };

        const role = await this.rbacRepository.createRole(roleData, tx);

        if (data.permissionIds.length > 0) {
          await this.rbacRepository.createRolePermissions(
            data.permissionIds.map((permissionId) => ({
              roleId: role.roleId,
              permissionId,
              createdBy: data.createdBy,
              updatedBy: data.updatedBy,
            })),
            tx
          );
        }

        return role;
      });

      logger.info('✅ [RbacController.createRole] New role created successfully');

      res.status(201).json({
        success: true,
        message: 'Role created successfully',
        data: result
      });
    } catch (error) {
      logger.error('❌ [RbacController.createRole] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null
      });
    }
  }

  /**
   * Update Role
   * PUT /rbac/roles/update/:roleId
   * 
   * @description Updates an existing role and its permission assignments.
   * @param roleId - The role ID to update
   * @body roleName - The new role name (optional)
   * @body status - The new status (optional)
   * @body permissionIds - Array of permission IDs to assign (replaces existing)
   */
  async updateRole(req: Request, res: Response): Promise<void> {
    try {
      logger.info('ℹ️ [RbacController.updateRole] Updating role...');
      logger.debug('🔍 [RbacController.updateRole] Request body:', req.body);

      const paramsSchema = z.object({
        roleId: z.uuid('Invalid role ID format'),
      });

      const paramsResult = paramsSchema.safeParse(req.params);
      if (!paramsResult.success) {
        logger.warn('⚠️ [RbacController.updateRole] Invalid params:', prettifyError(paramsResult.error));
        res.status(400).json({
          success: false,
          message: 'Invalid role ID',
          errors: paramsResult.error.issues,
        });
        return;
      }

      const updateSchema = z.object({
        roleName: z.string().min(1).max(50).optional(),
        status: z.string().max(20).optional(),
        permissionIds: z.array(z.uuid()).optional(),
        updatedBy: z.string().max(40).default('system'),
      });

      const { success, data, error } = updateSchema.safeParse(req.body);

      if (!success) {
        logger.warn('⚠️ [RbacController.updateRole] Validation failed:', prettifyError(error));
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: prettifyError(error),
        });
        return;
      }

      const { roleId } = paramsResult.data;

      const result = await db.transaction(async (tx) => {
        // Update role
        const role = await this.rbacRepository.updateRole(
          {
            roleName: data.roleName,
            status: data.status,
            updatedBy: data.updatedBy,
          },
          roleId,
          tx
        );

        // Sync role permissions if provided
        if (data.permissionIds !== undefined) {
          await this.rbacRepository.syncRolePermissions(
            roleId,
            data.permissionIds,
            data.updatedBy,
            data.updatedBy,
            tx
          );
        }

        return role;
      });

      // Fetch updated role permissions
      const rolePermissions = await this.rbacRepository.getRolePermission({ roleId });
      const permissionIds = rolePermissions.map(item => item.permissionId);

      logger.info('✅ [RbacController.updateRole] Role updated successfully');

      res.status(200).json({
        success: true,
        message: 'Role updated successfully',
        data: {
          roleId: result.roleId,
          roleName: result.roleName,
          permissionIds: permissionIds,
          status: result.status,
          createdAt: result.createdAt.toISOString(),
          updatedAt: result.updatedAt.toISOString(),
          createdBy: result.createdBy,
          updatedBy: result.updatedBy,
        }
      });
    } catch (error) {
      logger.error('❌ [RbacController.updateRole] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null
      });
    }
  }

  // ============================================
  // MODULE OPERATIONS
  // ============================================

  /**
   * Get Modules
   * GET /rbac/modules
   * 
   * @description Returns all modules grouped with their permissions.
   * @query moduleId - Filter by module ID
   * @query moduleName - Filter by module name (partial match)
   * @query status - Filter by status
   */
  async getModule(req: Request, res: Response): Promise<void> {
    try {
      logger.info('ℹ️ [RbacController.getModule] Fetching modules...');

      const filterSchema = z.object({
        moduleId: z.uuid().optional(),
        moduleName: z.string().max(50).optional(),
        status: z.string().max(20).optional(),
      });

      const { success, data: filter, error } = filterSchema.safeParse(req.query);

      if (!success) {
        logger.warn('⚠️ [RbacController.getModule] Validation failed:', prettifyError(error));
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: error.issues,
        });
        return;
      }

      const modules = await this.rbacRepository.getModule(filter);

      // Group by moduleName and transform the data
      const groupedModule = modules.reduce((acc, curr) => {
        const existingModule = acc.find((item: ModuleGroupType) => item.moduleName === curr.moduleName);

        if (existingModule) {
          existingModule.permission.push({
            moduleId: curr.id,
            permissionId: curr.permissionId,
            permissionType: curr.permissionType,
            description: curr.description || ''
          });
        } else {
          acc.push({
            moduleName: curr.moduleName,
            permission: [{
              moduleId: curr.id,
              permissionId: curr.permissionId,
              permissionType: curr.permissionType,
              description: curr.description || ''
            }],
            status: curr.status,
            createdAt: curr.createdAt.toISOString(),
            updatedAt: curr.updatedAt.toISOString(),
            createdBy: curr.createdBy,
            updatedBy: curr.updatedBy
          });
        }
        return acc;
      }, [] as Array<ModuleGroupType>);

      logger.info('✅ [RbacController.getModule] Modules fetched successfully, count:', groupedModule.length);

      res.status(200).json({
        success: true,
        message: 'Module fetched successfully',
        count: groupedModule.length,
        data: groupedModule
      });
    } catch (error) {
      logger.error('❌ [RbacController.getModule] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null
      });
    }
  }

  // ============================================
  // PERMISSION OPERATIONS
  // ============================================

  /**
   * Get All Permissions
   * GET /rbac/permissions
   * 
   * @description Returns all permissions in the system with optional filtering.
   * @query permissionId - Filter by permission ID
   * @query moduleId - Filter by module ID
   * @query permissionType - Filter by permission type
   * @query status - Filter by status
   */
  async getAllPermissions(req: Request, res: Response): Promise<void> {
    try {
      logger.info('ℹ️ [RbacController.getAllPermissions] Fetching all permissions...');

      const filterSchema = z.object({
        permissionId: z.uuid().optional(),
        moduleId: z.uuid().optional(),
        permissionType: z.string().max(50).optional(),
        status: z.string().max(20).optional(),
      });

      const { success, data: filter, error } = filterSchema.safeParse(req.query);

      if (!success) {
        logger.warn('⚠️ [RbacController.getAllPermissions] Validation failed:', prettifyError(error));
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: error.issues,
        });
        return;
      }

      const permissions = await this.rbacRepository.getPermission(filter);

      logger.info('✅ [RbacController.getAllPermissions] Permissions fetched successfully, count:', permissions.length);

      res.status(200).json({
        success: true,
        message: 'Permission fetched successfully',
        count: permissions.length,
        data: permissions
      });
    } catch (error) {
      logger.error('❌ [RbacController.getAllPermissions] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null
      });
    }
  }

  /**
   * Create Permission
   * POST /rbac/permissions/create
   * 
   * @description Creates a new permission linked to a module.
   * @body moduleId - The module ID to link the permission to
   * @body permissionType - The type of permission (View, Create, Update, Delete, etc.)
   * @body description - Description of the permission (optional)
   * @body status - The status (default: 'active')
   */
  async createPermission(req: Request, res: Response): Promise<void> {
    try {
      logger.info('ℹ️ [RbacController.createPermission] Creating permission...');
      logger.debug('🔍 [RbacController.createPermission] Request body:', req.body);

      const createSchema = z.object({
        moduleId: z.uuid('Invalid module ID format'),
        permissionType: z.string().min(1, 'Permission type is required').max(50),
        description: z.string().max(255).optional(),
        status: z.string().max(20).default('active'),
        createdBy: z.string().max(40).default('system'),
        updatedBy: z.string().max(40).default('system'),
      });

      const { success, data, error } = createSchema.safeParse(req.body);

      if (!success) {
        logger.warn('⚠️ [RbacController.createPermission] Validation failed:', prettifyError(error));
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: error.issues,
        });
        return;
      }

      const permission = await this.rbacRepository.createPermission(data);

      logger.info('✅ [RbacController.createPermission] Permission created successfully');

      res.status(201).json({
        success: true,
        message: 'Permission created successfully',
        data: permission
      });
    } catch (error: any) {
      logger.error('❌ [RbacController.createPermission] Error:', error);

      // Handle foreign key violation (invalid moduleId)
      if (error?.code === '23503') {
        res.status(400).json({
          success: false,
          message: 'Invalid module ID - module does not exist',
          data: null
        });
        return;
      }

      // Handle unique constraint violation
      if (error?.code === '23505') {
        res.status(400).json({
          success: false,
          message: 'Permission already exists for this module and type',
          data: null
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null
      });
    }
  }

  /**
   * Update Permission
   * PUT /rbac/permissions/update/:permissionId
   * 
   * @description Updates an existing permission.
   * @param permissionId - The permission ID to update
   * @body permissionType - The new permission type (optional)
   * @body description - The new description (optional)
   * @body status - The new status (optional)
   */
  async updatePermission(req: Request, res: Response): Promise<void> {
    try {
      logger.info('ℹ️ [RbacController.updatePermission] Updating permission...');
      logger.debug('🔍 [RbacController.updatePermission] Request body:', req.body);

      const paramsSchema = z.object({
        permissionId: z.uuid('Invalid permission ID format'),
      });

      const paramsResult = paramsSchema.safeParse(req.params);
      if (!paramsResult.success) {
        logger.warn('⚠️ [RbacController.updatePermission] Invalid params:', prettifyError(paramsResult.error));
        res.status(400).json({
          success: false,
          message: 'Invalid permission ID',
          errors: paramsResult.error.issues,
        });
        return;
      }

      const updateSchema = z.object({
        moduleId: z.uuid('Invalid module ID format').optional(),
        permissionType: z.string().max(50).optional(),
        description: z.string().max(255).optional(),
        status: z.string().max(20).optional(),
        updatedBy: z.string().max(40).default('system'),
      });

      const { success, data, error } = updateSchema.safeParse(req.body);

      if (!success) {
        logger.warn('⚠️ [RbacController.updatePermission] Validation failed:', prettifyError(error));
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: error.issues,
        });
        return;
      }

      const permission = await this.rbacRepository.updatePermission(data, paramsResult.data.permissionId);

      logger.info('✅ [RbacController.updatePermission] Permission updated successfully');

      res.status(200).json({
        success: true,
        message: 'Permission updated successfully',
        data: permission
      });
    } catch (error) {
      logger.error('❌ [RbacController.updatePermission] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null
      });
    }
  }

  // ============================================
  // ROLE PERMISSION OPERATIONS
  // ============================================

  /**
   * Get Role Permissions
   * GET /rbac/role-permission
   * 
   * @description Returns role permissions with module information.
   * For a given role, shows all available modules and whether the role has each permission.
   * @query roleId - Filter by role ID (required for full permission matrix)
   * @query permissionId - Filter by permission ID
   */
  async getRolePermission(req: Request, res: Response): Promise<void> {
    try {
      logger.info('ℹ️ [RbacController.getRolePermission] Fetching role permissions...');

      const filterSchema = z.object({
        roleId: z.uuid().optional(),
        permissionId: z.uuid().optional(),
      });

      const { success, data: filter, error } = filterSchema.safeParse(req.query);

      if (!success) {
        logger.warn('⚠️ [RbacController.getRolePermission] Validation failed:', prettifyError(error));
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: prettifyError(error)
        });
        return;
      }

      const rolePermissions = await this.rbacRepository.getRolePermission(filter);
      const modules = await this.rbacRepository.getModule({});

      // Create a map of existing role permissions
      const existingPermissions = rolePermissions.reduce((acc, curr) => {
        const key = `${curr.moduleName}-${curr.permissionId}`;
        acc[key] = curr;
        return acc;
      }, {} as Record<string, RolePermissionGroupType>);

      // Group modules by moduleName
      const modulesByName = modules.reduce((acc, curr) => {
        acc[curr.moduleName] = acc[curr.moduleName] || [];
        acc[curr.moduleName].push(curr);
        return acc;
      }, {} as Record<string, ModuleWithPermissionType[]>);

      // Transform data for all modules, including those without permissions
      const transformedData = Object.keys(modulesByName).map(moduleName => {
        const modulePermissions = modulesByName[moduleName];

        const allPermissions = modulePermissions.map((mp: ModuleWithPermissionType) => {
          const key = `${moduleName}-${mp.permissionId}`;
          const existingPermission = existingPermissions[key];

          if (existingPermission) {
            return {
              ...existingPermission,
              hasPermission: mp.permissionType === existingPermission.permissionType
            };
          } else {
            return {
              id: '',
              roleId: rolePermissions[0]?.roleId || filter.roleId || '',
              permissionId: mp.permissionId,
              permissionType: mp.permissionType,
              moduleId: mp.id,
              moduleName: moduleName,
              hasPermission: false
            };
          }
        });

        return {
          module: moduleName,
          permissions: allPermissions
        };
      });

      logger.info('✅ [RbacController.getRolePermission] Role permissions fetched successfully');

      res.status(200).json({
        success: true,
        message: 'Role permission fetched successfully',
        count: transformedData.length,
        data: transformedData
      });
    } catch (error) {
      logger.error('❌ [RbacController.getRolePermission] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null
      });
    }
  }

  /**
   * Create Role Permission
   * POST /rbac/role-permission/create
   * 
   * @description Creates a new role permission assignment.
   * @body roleId - The role ID
   * @body permissionId - The permission ID to assign
   */
  async createRolePermission(req: Request, res: Response): Promise<void> {
    try {
      logger.info('ℹ️ [RbacController.createRolePermission] Creating role permission...');
      logger.debug('🔍 [RbacController.createRolePermission] Request body:', req.body);

      const createSchema = z.object({
        roleId: z.uuid('Invalid role ID format'),
        permissionId: z.uuid('Invalid permission ID format'),
        createdBy: z.string().max(40).default('system'),
        updatedBy: z.string().max(40).default('system'),
      });

      const { success, data, error } = createSchema.safeParse(req.body);

      if (!success) {
        logger.warn('⚠️ [RbacController.createRolePermission] Validation failed:', prettifyError(error));
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: error.issues,
        });
        return;
      }

      const rolePermission = await this.rbacRepository.createRolePermission(data);

      logger.info('✅ [RbacController.createRolePermission] Role permission created successfully');

      res.status(201).json({
        success: true,
        message: 'Role permission created successfully',
        data: rolePermission
      });
    } catch (error: any) {
      logger.error('❌ [RbacController.createRolePermission] Error:', error);

      // Handle foreign key violation
      if (error?.code === '23503') {
        res.status(400).json({
          success: false,
          message: 'Invalid role ID or permission ID',
          data: null
        });
        return;
      }

      // Handle unique constraint violation
      if (error?.code === '23505') {
        res.status(400).json({
          success: false,
          message: 'Role permission already exists',
          data: null
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null
      });
    }
  }

  /**
   * Update Role Permissions
   * PUT /rbac/role-permission/update/:roleId
   * 
   * @description Updates (syncs) all permissions for a role.
   * Replaces all existing permissions with the provided list.
   * @param roleId - The role ID to update permissions for
   * @body permissionIds - Array of permission IDs to assign
   */
  async updateRolePermission(req: Request, res: Response): Promise<void> {
    try {
      logger.info('ℹ️ [RbacController.updateRolePermission] Updating role permissions...');
      logger.debug('🔍 [RbacController.updateRolePermission] Request body:', req.body);

      const paramsSchema = z.object({
        roleId: z.uuid('Invalid role ID format'),
      });

      const paramsResult = paramsSchema.safeParse(req.params);
      if (!paramsResult.success) {
        logger.warn('⚠️ [RbacController.updateRolePermission] Invalid params:', prettifyError(paramsResult.error));
        res.status(400).json({
          success: false,
          message: 'Invalid role ID',
          errors: prettifyError(paramsResult.error),
        });
        return;
      }

      const updateSchema = z.object({
        permissionIds: z.array(z.uuid()),
        updatedBy: z.string().max(40).default('system'),
      });

      const { success, data, error } = updateSchema.safeParse(req.body);

      if (!success) {
        logger.warn('⚠️ [RbacController.updateRolePermission] Validation failed:', prettifyError(error));
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: error.issues,
        });
        return;
      }

      const { roleId } = paramsResult.data;

      const rolePermissions = await this.rbacRepository.syncRolePermissions(
        roleId,
        data.permissionIds,
        data.updatedBy,
        data.updatedBy
      );

      logger.info('✅ [RbacController.updateRolePermission] Role permissions updated successfully');

      res.status(200).json({
        success: true,
        message: 'Role permission updated successfully',
        data: rolePermissions
      });
    } catch (error) {
      logger.error('❌ [RbacController.updateRolePermission] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null
      });
    }
  }
}

export { RbacControllerClass };
