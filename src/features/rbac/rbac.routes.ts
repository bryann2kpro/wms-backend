/**
 * RBAC Routes
 * 
 * @description Role-Based Access Control routes.
 * 
 * Endpoints:
 * - GET /rbac              - Get all user access
 * - GET /rbac/roles        - Get all roles
 * - GET /rbac/permissions  - Get all permissions
 */

import { Router } from 'express';
import { rbacController } from '@/composition-root.js';

const router = Router();

/**
 * @route GET /rbac
 * @description Get all access permissions for the authenticated user
 * @returns Array of user access permissions
 */
router.get('/', rbacController.getAllUserAccess.bind(rbacController));

/**
 * @route GET /rbac/roles
 * @description Get all roles in the system
 * @returns Array of roles
 */
router.get('/roles', rbacController.getAllRoles.bind(rbacController));

/**
 * @route GET /rbac/permissions
 * @description Get all permissions in the system
 * @returns Array of permissions
 */
router.get('/permissions', rbacController.getAllPermissions.bind(rbacController));

export default router;