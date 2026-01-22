/**
 * Auth Routes
 * 
 * @description Authentication and authorization routes.
 * 
 * Endpoints:
 * - POST /auth/login          - User login
 * - POST /auth/register       - User registration
 * - GET  /auth/profile        - Get current user profile
 * - GET  /auth/roles          - Get all roles
 * - POST /auth/roles          - Create a new role
 * - PUT  /auth/roles/:id      - Update a role
 * - GET  /auth/permissions    - Get all permissions
 * - POST /auth/permissions    - Create a new permission
 * - PUT  /auth/permissions/:id - Update a permission
 */

import { Router } from 'express';
import { authController } from '@/composition-root.js';

const router = Router();

// ============================================
// AUTH ROUTES
// ============================================

/**
 * @route POST /auth/login
 * @description Authenticate user with email and password
 * @body { email: string, password: string }
 * @returns { accessToken, refreshToken, expiredAt }
 */
router.post('/login', authController.login.bind(authController));

/**
 * @route POST /auth/register
 * @description Register a new user
 * @body { email: string, displayName: string, password: string, contactNo?: string, roleId: string }
 * @returns { id, email, displayName }
 */
router.post('/register', authController.register.bind(authController));

/**
 * @route GET /auth/profile
 * @description Get current authenticated user's profile
 * @headers Authorization: Bearer <token>
 * @returns { id, email, displayName, contactNo, isActive, role, permissions }
 */
router.get('/profile', authController.getProfile.bind(authController));

// ============================================
// ROLE ROUTES
// ============================================

/**
 * @route GET /auth/roles
 * @description Get all roles
 * @returns Array of roles
 */
router.get('/roles', authController.getRoles.bind(authController));

/**
 * @route POST /auth/roles
 * @description Create a new role
 * @body { roleName: string, permissionId?: string[], status: string }
 * @returns Created role
 */
router.post('/roles', authController.createRole.bind(authController));

/**
 * @route PUT /auth/roles/:id
 * @description Update an existing role
 * @params id - Role UUID
 * @body { roleName?: string, permissionId?: string[], status?: string }
 * @returns Updated role
 */
router.put('/roles/:id', authController.updateRole.bind(authController));

// ============================================
// PERMISSION ROUTES
// ============================================

/**
 * @route GET /auth/permissions
 * @description Get all permissions
 * @returns Array of permissions
 */
router.get('/permissions', authController.getPermissions.bind(authController));

/**
 * @route POST /auth/permissions
 * @description Create a new permission
 * @body { permissionName: string, status: string }
 * @returns Created permission
 */
router.post('/permissions', authController.createPermission.bind(authController));

/**
 * @route PUT /auth/permissions/:id
 * @description Update an existing permission
 * @params id - Permission UUID
 * @body { permissionName?: string, status?: string }
 * @returns Updated permission
 */
router.put('/permissions/:id', authController.updatePermission.bind(authController));

export default router;
