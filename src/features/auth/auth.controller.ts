/**
 * Auth Controller
 * 
 * @description Handles authentication-related HTTP requests.
 * Uses Zod v4 for request validation.
 * 
 * Uses normalized RBAC structure:
 * - Users → UserRole (junction) → Role
 * - Role → RolePermission (junction) → Permission → Module
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { 
  AuthRepositoryClass,
} from './auth.repository.js';
import { UserInsertType } from './auth.model.js';
import { JwtControllerClass } from '@/features/jwt/jwt.controller.js';
import { Error } from '@/error/index.js';
import { hashPassword, comparePassword } from '@/util/password.js';
import { sendPasswordResetEmail } from '@/util/mailer.js';
import crypto from 'node:crypto';
import { logger } from '@/util/logger.js';
import { db } from '@/db/index.js';
import { RbacRepositoryClass } from '@/features/rbac/rbac.repository.js';

// ============================================
// ZOD SCHEMAS
// ============================================

/**
 * Login request schema
 */
const LoginSchema = z.object({
  username: z.email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * Forgot password request schema
 */
const ForgotPasswordSchema = z.object({
  email: z.email('Invalid email format'),
});

/**
 * Reset password request schema
 */
const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

/**
 * Register user request schema
 */
const RegisterUserSchema = z.object({
  email: z.email('Invalid email format'),
  displayName: z.string().min(1, 'Display name is required').max(100),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  contactNo: z.string().max(20).optional(),
  roleId: z.uuid('Invalid role ID format'),
});

// ============================================
// CONTROLLER CLASS
// ============================================

class AuthControllerClass {

  constructor(
    private authRepository: AuthRepositoryClass, 
    private jwtController: JwtControllerClass,
    private rbacRepository: RbacRepositoryClass
  ) {}
  
  // ============================================
  // AUTH ENDPOINTS
  // ============================================

  /**
   * User Login
   * POST /auth/login
   * 
   * @description Authenticates a user with email and password.
   * Returns JWT access and refresh tokens on success.
   */
  async login(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [AuthController.login] Processing login request...');
      
      const parseResult = LoginSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        logger.warn('⚠️ [AuthController.login] Validation failed');
        return res.status(400).json({
          success: false,
          message: 'Email and Password are required',
          data: null,
        });
      }

      const { username: email, password } = parseResult.data;
      logger.debug('🔍 [AuthController.login] Attempting login for:', email);

      const user = await this.authRepository.getUserByEmail(email);

      if (!user) {
        logger.warn('⚠️ [AuthController.login] User not found:', email);
        return res.status(401).json({
          success: false,
          message: Error.INVALID_CREDENTIALS,
          data: null,
        });
      }

      if (!user.isActive) {
        logger.warn('⚠️ [AuthController.login] Account deactivated:', email);
        return res.status(403).json({
          success: false,
          message: 'Account is deactivated',
          data: null,
        });
      }

      const isPasswordValid = await comparePassword(password, user.passwordHash);
      
      if (!isPasswordValid) {
        logger.warn('⚠️ [AuthController.login] Invalid password for:', email);
        return res.status(401).json({
          success: false,
          message: Error.INVALID_CREDENTIALS,
          data: null,
        });
      }

      const tokenPayload = { username: email, loginType: 'EMAIL' as const };
      const accessToken = this.jwtController.generateAccessToken(tokenPayload);
      const refreshToken = this.jwtController.generateRefreshToken(tokenPayload);
      const decodedToken = this.jwtController.verifyToken(accessToken);

      logger.info('✅ [AuthController.login] Login successful for:', email);

      return res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          accessToken,
          refreshToken,
          expiredAt: decodedToken.exp ? decodedToken.exp * 1000 : null,
        },
      });
    } catch (error) {
      logger.error('❌ [AuthController.login] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /**
   * Register User
   * POST /auth/register
   * 
   * @description Creates a new user account and assigns role via UserRole junction table.
   */
  async register(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [AuthController.register] Processing registration request...');
      
      const parseResult = RegisterUserSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        logger.warn('⚠️ [AuthController.register] Validation failed:', parseResult.error.issues);
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: parseResult.error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
          data: null,
        });
      }

      const { email, displayName, password, contactNo, roleId } = parseResult.data;
      logger.debug('🔍 [AuthController.register] Registering user:', email);

      const existingUser = await this.authRepository.getUserByEmail(email);
      
      if (existingUser) {
        logger.warn('⚠️ [AuthController.register] User already exists:', email);
        return res.status(409).json({
          success: false,
          message: Error.USER_ALREADY_EXISTS,
          data: null,
        });
      }

      const role = await this.authRepository.getRoleById(roleId);
      
      if (!role) {
        logger.warn('⚠️ [AuthController.register] Invalid role ID:', roleId);
        return res.status(400).json({
          success: false,
          message: 'Invalid role ID',
          data: null,
        });
      }

      const passwordHash = await hashPassword(password);

      // Use transaction to create user and assign role atomically
      const result = await db.transaction(async (tx) => {
        // Create user
        const userData: Omit<UserInsertType, 'id' | 'createdAt' | 'updatedAt'> = {
          email,
          displayName,
          passwordHash,
          contactNo,
          isActive: true,
          createdBy: 'system',
          updatedBy: 'system',
        };

        const newUser = await this.authRepository.createUser(userData, tx);

        // Assign role to user via UserRole junction table
        await this.authRepository.assignRoleToUser({
          userId: newUser.id,
          roleId,
          status: 'active',
          createdBy: 'system',
          updatedBy: 'system',
        }, tx);

        return newUser;
      });

      logger.info('✅ [AuthController.register] User registered successfully:', email);

      return res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: {
          id: result.id,
          email: result.email,
          displayName: result.displayName,
          role: {
            roleId: role.roleId,
            roleName: role.roleName,
          },
        },
      });
    } catch (error) {
      logger.error('❌ [AuthController.register] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /**
   * Get Current User Profile
   * GET /auth/profile
   * 
   * @description Returns the authenticated user's profile with roles and permissions.
   */
  async getProfile(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [AuthController.getProfile] Fetching user profile...');
      
      const token = req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.split(' ')[1]
        : null;

      if (!token) {
        logger.warn('⚠️ [AuthController.getProfile] Token is required');
        return res.status(401).json({
          success: false,
          message: Error.TOKEN_IS_REQUIRED,
          data: null,
        });
      }

      const user = await this.authRepository.getUserDataByToken(token);

      if (!user) {
        logger.warn('⚠️ [AuthController.getProfile] User not found from token');
        return res.status(404).json({
          success: false,
          message: Error.USER_NOT_FOUND,
          data: null,
        });
      }

      // Get user's roles via UserRole junction table
      // const roles = await this.authRepository.getUserRoles(user.id);

      // // Get user's permissions via roles
      // const permissions = await this.authRepository.getUserPermissions(user.id);

      const userRoleWithPermission = await this.rbacRepository.getUserRoleWithPermission(user.id);
      const readPermission = userRoleWithPermission.filter(r => r.permissionType === "Read").map(r => r.moduleName);
      const createPermission = userRoleWithPermission.filter(r => r.permissionType === "Create").map(r => r.moduleName);
      const updatePermission = userRoleWithPermission.filter(r => r.permissionType === "Update").map(r => r.moduleName);
      // const deletePermission = userRoleWithPermission.filter(r => r.permissionType === "Delete").map(r => r.moduleName);
      const approvePermission = userRoleWithPermission.filter(r => r.permissionType === "Approve").map(r => r.moduleName);
      // const exportPermission = userRoleWithPermission.filter(r => r.permissionType === "Export").map(r => r.moduleName);
      // const confirmPermission = userRoleWithPermission.filter(r => r.permissionType === "Confirm").map(r => r.moduleName);
      // const pickPermission = userRoleWithPermission.filter(r => r.permissionType === "Pick").map(r => r.moduleName);
      // const packPermission = userRoleWithPermission.filter(r => r.permissionType === "Pack").map(r => r.moduleName);

      logger.info('✅ [AuthController.getProfile] Profile fetched successfully for:', user.email);

      return res.status(200).json({
        success: true,
        message: 'Profile fetched successfully',
        data: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          contactNo: user.contactNo,
          isActive: user.isActive,
          roles: userRoleWithPermission[0]?.roleName ?[userRoleWithPermission[0]?.roleName]: [] , // Assuming 1 role for now
          readPermission: readPermission,
          createPermission: createPermission,
          updatePermission: updatePermission,
          approvePermission: approvePermission,
        },
      });
    } catch (error) {
      logger.error('❌ [AuthController.getProfile] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }
  /**
   * Forgot Password
   * POST /auth/forgot-password
   *
   * @description Generates a password reset token and emails a reset link.
   * Always responds with 200 to avoid user enumeration.
   */
  async forgotPassword(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [AuthController.forgotPassword] Processing forgot password request...');

      const parseResult = ForgotPasswordSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ success: false, message: 'Valid email is required', data: null });
      }

      const { email } = parseResult.data;
      const user = await this.authRepository.getUserByEmail(email);

      // Always return 200 — do not reveal whether email exists
      if (!user || !user.isActive) {
        return res.status(200).json({ success: true, message: 'If that email exists, a reset link has been sent.', data: null });
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await this.authRepository.createPasswordResetToken(user.id, token, expiresAt);

      const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
      const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

      await sendPasswordResetEmail(email, resetUrl);

      logger.info('✅ [AuthController.forgotPassword] Reset email sent to:', email);
      return res.status(200).json({ success: true, message: 'If that email exists, a reset link has been sent.', data: null });
    } catch (error) {
      logger.error('❌ [AuthController.forgotPassword] Error:', error);
      return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Reset Password
   * POST /auth/reset-password
   *
   * @description Validates the reset token and updates the user's password.
   */
  async resetPassword(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [AuthController.resetPassword] Processing password reset...');

      const parseResult = ResetPasswordSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          message: parseResult.error.issues[0]?.message ?? 'Validation failed',
          data: null,
        });
      }

      const { token, password } = parseResult.data;
      const resetToken = await this.authRepository.getPasswordResetToken(token);

      if (!resetToken || resetToken.expiresAt < new Date()) {
        return res.status(400).json({ success: false, message: 'Reset link is invalid or has expired.', data: null });
      }

      const passwordHash = await hashPassword(password);
      await this.authRepository.updateUserPassword(resetToken.userId, passwordHash);
      await this.authRepository.deletePasswordResetToken(token);

      logger.info('✅ [AuthController.resetPassword] Password reset for userId:', resetToken.userId);
      return res.status(200).json({ success: true, message: 'Password reset successfully.', data: null });
    } catch (error) {
      logger.error('❌ [AuthController.resetPassword] Error:', error);
      return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}

// Export class for DI
export { AuthControllerClass };
