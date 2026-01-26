import { Router } from 'express';
import { rbacController } from '@/composition-root.js';
import { requiredPermission } from '@/middlewares/permission';
import { PermissionGroup } from './rbac.model';
import { AuditTrailAction, auditTrailMiddleware } from '@/middlewares/audit-trail';

const router = Router();

// ============================================
// USER ACCESS
// ============================================

/**
 * @route GET /rbac
 * @description Get all access permissions for the authenticated user
 * @returns Array of user access permissions
 */
router.get('/', rbacController.getAllUserAccess.bind(rbacController));

// ============================================
// USER ROLE ROUTES
// ============================================

/**
 * @route GET /rbac/user-role
 * @description Get all user roles with optional filtering
 * @query userId - Filter by user ID
 * @query roleId - Filter by role ID
 * @query status - Filter by status
 * @returns Array of user roles
 */
router.get('/user-role', requiredPermission(PermissionGroup.ROLE, 'Read'), rbacController.getUserRole.bind(rbacController));

/**
 * @route POST /rbac/user-role/create
 * @description Create a new user role assignment
 * @body userId - User ID to assign role to
 * @body roleId - Role ID to assign
 * @body status - Status (default: 'active')
 * @returns Created user role object
 */
router.post('/user-role/create', requiredPermission(PermissionGroup.ROLE, 'create'), auditTrailMiddleware(AuditTrailAction.CREATE), rbacController.createUserRole.bind(rbacController));

/**
 * @route PUT /rbac/user-role/update/:userRoleId
 * @description Update an existing user role assignment
 * @param userRoleId - User role ID to update
 * @body roleId - New role ID (optional)
 * @body status - New status (optional)
 * @returns Updated user role object
 */
router.put('/user-role/update/:userRoleId', requiredPermission(PermissionGroup.ROLE, 'update'), auditTrailMiddleware(AuditTrailAction.UPDATE), rbacController.updateUserRole.bind(rbacController));

// ============================================
// ROLE ROUTES
// ============================================

/**
 * @route GET /rbac/roles
 * @description Get all roles in the system with optional filtering
 * @query roleId - Filter by role ID
 * @query roleName - Filter by role name
 * @query status - Filter by status
 * @returns Array of roles
 */
router.get('/roles', requiredPermission(PermissionGroup.ROLE, 'Read'), rbacController.getAllRoles.bind(rbacController));

/**
 * @route POST /rbac/roles/create
 * @description Create a new role with optional permission assignments
 * @body roleName - Role name (required)
 * @body status - Status (default: 'active')
 * @body permissionIds - Array of permission IDs (optional)
 * @returns Created role object
 */
router.post('/roles/create', requiredPermission(PermissionGroup.ROLE, 'create'), auditTrailMiddleware(AuditTrailAction.CREATE), rbacController.createRole.bind(rbacController));

/**
 * @route PUT /rbac/roles/update/:roleId
 * @description Update an existing role and its permissions
 * @param roleId - Role ID to update
 * @body roleName - New role name (optional)
 * @body status - New status (optional)
 * @body permissionIds - Array of permission IDs (optional, replaces existing)
 * @returns Updated role object with permission IDs
 */
router.put('/roles/update/:roleId', requiredPermission(PermissionGroup.ROLE, 'update'), auditTrailMiddleware(AuditTrailAction.UPDATE), rbacController.updateRole.bind(rbacController));

// ============================================
// MODULE ROUTES
// ============================================

/**
 * @route GET /rbac/modules
 * @description Get all modules grouped with their permissions
 * @query moduleId - Filter by module ID
 * @query moduleName - Filter by module name
 * @query status - Filter by status
 * @returns Array of modules with permissions
 */
router.get('/modules', requiredPermission(PermissionGroup.ROLE, 'Read'), rbacController.getModule.bind(rbacController));

/**
 * @route POST /rbac/modules/create
 * @description Create a new module
 * @body moduleName - Module name (required)
 * @body status - Status (default: 'active')
 * @body createdBy - Created by (required)
 * @body updatedBy - Updated by (required)
 * @returns Created module object
 */
router.post('/modules/create', requiredPermission(PermissionGroup.ROLE, 'create'), auditTrailMiddleware(AuditTrailAction.CREATE), rbacController.createModule.bind(rbacController));

/**
 * @route PUT /rbac/modules/update/:moduleId
 * @description Update an existing module
 * @param moduleId - Module ID to update
 * @body moduleName - New module name (optional)
 * @body status - New status (optional)
 * @body updatedBy - Updated by (required)
 * @returns Updated module object
 */
router.put('/modules/update/:moduleId', requiredPermission(PermissionGroup.ROLE, 'update'), auditTrailMiddleware(AuditTrailAction.UPDATE), rbacController.updateModule.bind(rbacController));

// ============================================
// PERMISSION ROUTES
// ============================================

/**
 * @route GET /rbac/permissions
 * @description Get all permissions in the system with optional filtering
 * @query permissionId - Filter by permission ID
 * @query moduleId - Filter by module ID
 * @query permissionType - Filter by permission type
 * @query status - Filter by status
 * @returns Array of permissions
 */
router.get('/permissions', requiredPermission(PermissionGroup.ROLE, 'Read'), rbacController.getAllPermissions.bind(rbacController));

/**
 * @route POST /rbac/permissions/create
 * @description Create a new permission linked to a module
 * @body moduleId - Module ID (required)
 * @body permissionType - Permission type (required)
 * @body description - Description (optional)
 * @body status - Status (default: 'active')
 * @returns Created permission object
 */
router.post('/permissions/create', requiredPermission(PermissionGroup.ROLE, 'create'), auditTrailMiddleware(AuditTrailAction.CREATE), rbacController.createPermission.bind(rbacController));

/**
 * @route PUT /rbac/permissions/update/:permissionId
 * @description Update an existing permission
 * @param permissionId - Permission ID to update
 * @body moduleId - New module ID (optional)
 * @body permissionType - New permission type (optional)
 * @body description - New description (optional)
 * @body status - New status (optional)
 * @returns Updated permission object
 */
router.put('/permissions/update/:permissionId', requiredPermission(PermissionGroup.ROLE, 'update'), auditTrailMiddleware(AuditTrailAction.UPDATE), rbacController.updatePermission.bind(rbacController));

// ============================================
// ROLE PERMISSION ROUTES
// ============================================

/**
 * @route GET /rbac/role-permission
 * @description Get role permissions with module information
 * @query roleId - Filter by role ID (required for full permission matrix)
 * @query permissionId - Filter by permission ID
 * @returns Array of modules with permission status for the role
 */
router.get('/role-permission', requiredPermission(PermissionGroup.ROLE, 'Read'), rbacController.getRolePermission.bind(rbacController));

/**
 * @route POST /rbac/role-permission/create
 * @description Create a new role permission assignment
 * @body roleId - Role ID
 * @body permissionId - Permission ID
 * @returns Created role permission object
 */
router.post('/role-permission/create', requiredPermission(PermissionGroup.ROLE, 'create'), auditTrailMiddleware(AuditTrailAction.CREATE), rbacController.createRolePermission.bind(rbacController));

/**
 * @route PUT /rbac/role-permission/update/:roleId
 * @description Update (sync) all permissions for a role
 * @param roleId - Role ID to update permissions for
 * @body permissionIds - Array of permission IDs to assign (replaces existing)
 * @returns Array of updated role permissions
 */
router.put('/role-permission/update/:roleId', requiredPermission(PermissionGroup.ROLE, 'update'), auditTrailMiddleware(AuditTrailAction.UPDATE), rbacController.updateRolePermission.bind(rbacController));

export default router;
