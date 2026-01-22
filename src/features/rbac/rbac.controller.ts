/**
 * RBAC Controller
 * 
 * @description Handles Role-Based Access Control HTTP requests.
 */

import { Request, Response } from 'express';
import { AuthRepositoryClass, RoleInsertType } from '@/features/auth/auth.repository.js';
import { Error } from '@/error/index.js';
import { logger } from '@/util/logger.js';
import z, { prettifyError } from 'zod';
import { db } from '@/db';
import { RbacRepositoryClass } from './rbac.repository';
class RbacControllerClass {
  constructor(
    private authRepository: AuthRepositoryClass,
    private rbacRepository: RbacRepositoryClass
  ) {}

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

  /**
   * Get All Roles
   * GET /rbac/roles
   * 
   * @description Returns all roles in the system.
   */
  async getAllRoles(req: Request, res: Response): Promise<void> {
    try {
      logger.info('ℹ️ [RbacController.getAllRoles] Fetching all roles...');
      
      const roles = await this.authRepository.getAllRoles();

      logger.info('✅ [RbacController.getAllRoles] Roles fetched successfully, count:', roles.length);

      res.status(200).json({
        success: true,
        message: 'Roles fetched successfully',
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
   * Get All Permissions
   * GET /rbac/permissions
   * 
   * @description Returns all permissions in the system.
   */
  async getAllPermissions(req: Request, res: Response): Promise<void> {
    try {
      logger.info('ℹ️ [RbacController.getAllPermissions] Fetching all permissions...');
      
      const permissions = await this.authRepository.getAllPermissions();

      logger.info('✅ [RbacController.getAllPermissions] Permissions fetched successfully, count:', permissions.length);

      res.status(200).json({
        success: true,
        message: 'Permissions fetched successfully',
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
   * Create Role
   * POST /rbac/roles/create
   * 
   * @description Creates a new role in the system.
   */
  async createRole(req: Request, res: Response): Promise<void> {
    try {
      logger.info('ℹ️ [RbacController.createRole] Request received for creating new role..., validating request body...');
      logger.debug('🔍 [RbacController.createRole] Request body:', req.body);
      const roleCreateSchema = z.object({
        roleName: z.string().min(1, 'Role name is required').max(50),
        status: z.string().max(20).default('active'),
        permissionIds: z.array(z.uuid()).default([]),
      });

      const { success, data, error } = roleCreateSchema.safeParse(req.body);

      if (!success) {
        logger.warn('⚠️ [RbacController.createRole] Validation failed:', prettifyError(error));
        logger.debug('🔍 [RbacController.createRole] Validation error:', error);
        res.status(400).json({
          success: false,
          message: 'Validation failed',
        });

        return;
      }

      logger.info('ℹ️ [RbacController.createRole] Request body validated successfully, creating new role...');

      const result = await db.transaction(async (tx) => {
        const roleData: RoleInsertType = {
          roleName: data.roleName,
          status: data.status,
          createdBy: 'system',
          updatedBy: 'system',
        }
        
        const role = await this.rbacRepository.createRole(roleData, tx);

        if (data.permissionIds.length > 0) {
          await this.rbacRepository.createRolePermissions(
            data.permissionIds.map((permissionId) => ({
              roleId: role.roleId,
              permissionId,
              createdBy: 'system',
              updatedBy: 'system',
            })),
            tx
          );
        }

        return role;
      });


      logger.info('✅ [RbacController.createRole] New role created successfully...');

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
}

export { RbacControllerClass };