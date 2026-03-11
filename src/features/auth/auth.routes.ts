/**
 * Auth Routes
 * 
 * @description Authentication and authorization routes.
 * 
 * Uses normalized RBAC structure:
 * - Users → UserRole (junction) → Role
 * - Role → RolePermission (junction) → Permission → Module
 * 
 * Endpoints:
 * - POST /auth/login              - User login
 * - POST /auth/register           - User registration
 * - GET  /auth/profile            - Get current user profile
 * 
 * - GET  /auth/roles              - Get all roles
 * - POST /auth/roles              - Create a new role
 * - PUT  /auth/roles/:id          - Update a role
 * - GET  /auth/roles/:id/permissions - Get role permissions matrix
 * 
 * - GET  /auth/modules            - Get all modules with permissions
 * 
 * - GET  /auth/permissions        - Get all permissions
 * - POST /auth/permissions        - Create a new permission
 * - PUT  /auth/permissions/:id    - Update a permission
 */

import { Router } from 'express';
import { authController } from '@/composition-root.js';
import authenticateJWT from '@/middlewares/authenticate-jwt';

const router = Router();

// ============================================
// AUTH ROUTES (Public)
// ============================================

/**
 * @route POST /auth/login
 * @description Authenticate user with email and password
 * @body { email: string, password: string }
 * @returns { accessToken, refreshToken, expiredAt }
 */
router.post('/login', authController.login.bind(authController));

/**
 * @route POST /auth/forgot-password
 * @description Request a password reset email
 * @body { email: string }
 */
router.post('/forgot-password', authController.forgotPassword.bind(authController));

/**
 * @route POST /auth/reset-password
 * @description Reset password using a valid token
 * @body { token: string, password: string }
 */
router.post('/reset-password', authController.resetPassword.bind(authController));

/**
 * @route POST /auth/register
 * @description Register a new user with role assignment
 * @body { email: string, displayName: string, password: string, contactNo?: string, roleId: string }
 * @returns { id, email, displayName, role }
 */
router.post('/register', authController.register.bind(authController));

// ============================================
// USER ROUTES (Protected)
// ============================================

/**
 * @route GET /auth/profile
 * @description Get current authenticated user's profile with roles and permissions
 * @headers Authorization: Bearer <token>
 * @returns { id, email, displayName, contactNo, isActive, roles, permissions }
 */
router.get('/profile', authenticateJWT, authController.getProfile.bind(authController));

export default router;
