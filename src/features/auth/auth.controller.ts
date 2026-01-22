/**
 * Auth Controller
 * 
 * @description Handles authentication-related HTTP requests.
 * Uses Zod v4 for request validation.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { 
  AuthRepositoryClass,
  type RoleType,
  type PermissionType
} from './auth.repository.js';
import { UserType } from './auth.model.js';
import { JwtControllerClass } from '@/features/jwt/jwt.controller.js';
import { Error } from '@/error/index.js';
import { hashPassword, comparePassword } from '@/util/password.js';
import { logger } from '@/util/logger.js';

// ============================================
// ZOD SCHEMAS
// ============================================

/**
 * Login request schema
 */
const LoginSchema = z.object({
  email: z.email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
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

/**
 * Create role request schema
 */
const CreateRoleSchema = z.object({
  roleName: z.string().min(1, 'Role name is required').max(40),
  permissionId: z.array(z.string()).optional(),
  status: z.string().min(1, 'Status is required').max(20),
});

/**
 * Update role request schema
 */
const UpdateRoleSchema = z.object({
  roleId: z.uuid('Invalid role ID format'),
  roleName: z.string().min(1).max(40).optional(),
  permissionId: z.array(z.string()).optional(),
  status: z.string().max(20).optional(),
});

/**
 * Create permission request schema
 */
const CreatePermissionSchema = z.object({
  permissionName: z.string().min(1, 'Permission name is required').max(40),
  status: z.string().min(1, 'Status is required').max(20),
});

/**
 * Update permission request schema
 */
const UpdatePermissionSchema = z.object({
  permissionId: z.uuid('Invalid permission ID format'),
  permissionName: z.string().min(1).max(40).optional(),
  status: z.string().max(20).optional(),
});

// ============================================
// CONTROLLER CLASS
// ============================================

class AuthControllerClass {

  constructor(
    private authRepository: AuthRepositoryClass, 
    private jwtController: JwtControllerClass) {}
  
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
      
      // Validate request body with Zod
      const parseResult = LoginSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        logger.warn('⚠️ [AuthController.login] Validation failed: missing credentials');
        return res.status(400).json({
          status: false,
          message: 'Username and Password are required',
          data: null,
        });
      }

      const { email, password } = parseResult.data;
      logger.debug('🔍 [AuthController.login] Attempting login for email:', email);

      // Find user by email
      const user = await this.authRepository.getUserByEmail(email);

      if (!user) {
        logger.warn('⚠️ [AuthController.login] User not found:', email);
        return res.status(401).json({
          success: false,
          message: Error.INVALID_CREDENTIALS,
          data: null,
        });
      }

      // Check if user is active
      if (!user.isActive) {
        logger.warn('⚠️ [AuthController.login] Account deactivated:', email);
        return res.status(403).json({
          success: false,
          message: 'Account is deactivated',
          data: null,
        });
      }

      // Verify password
      const isPasswordValid = await comparePassword(password, user.passwordHash);
      
      if (!isPasswordValid) {
        logger.warn('⚠️ [AuthController.login] Invalid password for:', email);
        return res.status(401).json({
          success: false,
          message: Error.INVALID_CREDENTIALS,
          data: null,
        });
      }

      // Generate tokens
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
   * @description Creates a new user account.
   */
  async register(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [AuthController.register] Processing registration request...');
      
      // Validate request body with Zod
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

      // Check if user already exists
      const existingUser = await this.authRepository.getUserByEmail(email);
      
      if (existingUser) {
        logger.warn('⚠️ [AuthController.register] User already exists:', email);
        return res.status(409).json({
          success: false,
          message: Error.USER_ALREADY_EXISTS,
          data: null,
        });
      }

      // Verify role exists
      const role = await this.authRepository.getRoleById(roleId);
      
      if (!role) {
        logger.warn('⚠️ [AuthController.register] Invalid role ID:', roleId);
        return res.status(400).json({
          success: false,
          message: 'Invalid role ID',
          data: null,
        });
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create user
      const userData: Omit<UserType, 'id' | 'createdAt' | 'updatedAt'> = {
        email,
        displayName,
        passwordHash,
        contactNo,
        roleId,
        isActive: true,
      };

      const newUser = await this.authRepository.createUser(userData);

      logger.info('✅ [AuthController.register] User registered successfully:', email);

      return res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: {
          id: newUser.id,
          email: newUser.email,
          displayName: newUser.displayName,
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
   * @description Returns the authenticated user's profile.
   */
  async getProfile(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [AuthController.getProfile] Fetching user profile...');
      
      // Extract token from Authorization header
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

      // Get user from token
      const user = await this.authRepository.getUserDataByToken(token);

      if (!user) {
        logger.warn('⚠️ [AuthController.getProfile] User not found from token');
        return res.status(404).json({
          success: false,
          message: Error.USER_NOT_FOUND,
          data: null,
        });
      }

      // Get user's permissions via role
      const permissions = await this.authRepository.getPermissionsByRoleId(user.roleId);

      // Get role details
      const role = await this.authRepository.getRoleById(user.roleId);

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
          role: role ? {
            id: role.roleId,
            name: role.roleName,
          } : null,
          permissions,
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

  // ============================================
  // ROLE ENDPOINTS
  // ============================================

  /**
   * Get All Roles
   * GET /auth/roles
   * 
   * @description Returns all roles in the system.
   */
  async getRoles(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [AuthController.getRoles] Fetching all roles...');
      
      const roles = await this.authRepository.getAllRoles();

      logger.info('✅ [AuthController.getRoles] Roles fetched successfully, count:', roles.length);

      return res.status(200).json({
        success: true,
        message: 'Roles fetched successfully',
        data: roles,
      });
    } catch (error) {
      logger.error('❌ [AuthController.getRoles] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /**
   * Create Role
   * POST /auth/roles
   * 
   * @description Creates a new role.
   */
  async createRole(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [AuthController.createRole] Creating new role...');
      
      // Validate request body with Zod
      const parseResult = CreateRoleSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        logger.warn('⚠️ [AuthController.createRole] Validation failed:', parseResult.error.issues);
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

      const { roleName, permissionId, status } = parseResult.data;
      logger.debug('🔍 [AuthController.createRole] Role name:', roleName);

      // Check if role already exists
      const existingRole = await this.authRepository.getRoleByName(roleName);
      
      if (existingRole) {
        logger.warn('⚠️ [AuthController.createRole] Role already exists:', roleName);
        return res.status(409).json({
          success: false,
          message: Error.USER_ROLE_ALREADY_EXISTS,
          data: null,
        });
      }

      // Create role
      const roleData: Omit<RoleType, 'roleId' | 'createdAt' | 'updatedAt'> = {
        roleName,
        permissionId: permissionId || null,
        status,
        createdBy: 'system', // TODO: Get from authenticated user
        updatedBy: 'system',
      };

      const newRole = await this.authRepository.createRole(roleData);

      logger.info('✅ [AuthController.createRole] Role created successfully:', roleName);

      return res.status(201).json({
        success: true,
        message: 'Role created successfully',
        data: newRole,
      });
    } catch (error) {
      logger.error('❌ [AuthController.createRole] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /**
   * Update Role
   * PUT /auth/roles/:id
   * 
   * @description Updates an existing role.
   */
  async updateRole(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [AuthController.updateRole] Updating role...');
      
      // Validate request body with Zod
      const parseResult = UpdateRoleSchema.safeParse({
        ...req.body,
        roleId: req.params.id || req.body.roleId,
      });
      
      if (!parseResult.success) {
        logger.warn('⚠️ [AuthController.updateRole] Validation failed:', parseResult.error.issues);
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

      const { roleId, roleName, permissionId, status } = parseResult.data;
      logger.debug('🔍 [AuthController.updateRole] Role ID:', roleId);

      // Check if role exists
      const existingRole = await this.authRepository.getRoleById(roleId);
      
      if (!existingRole) {
        logger.warn('⚠️ [AuthController.updateRole] Role not found:', roleId);
        return res.status(404).json({
          success: false,
          message: 'Role not found',
          data: null,
        });
      }

      // Check for name conflict if renaming
      if (roleName && roleName !== existingRole.roleName) {
        const conflictingRole = await this.authRepository.getRoleByName(roleName);
        if (conflictingRole) {
          logger.warn('⚠️ [AuthController.updateRole] Role name conflict:', roleName);
          return res.status(409).json({
            success: false,
            message: Error.USER_ROLE_ALREADY_EXISTS,
            data: null,
          });
        }
      }

      // Update role
      const updateData: Partial<RoleType> = {
        ...(roleName && { roleName }),
        ...(permissionId !== undefined && { permissionId }),
        ...(status && { status }),
        updatedBy: 'system', // TODO: Get from authenticated user
      };

      const updatedRole = await this.authRepository.updateRole(roleId, updateData);

      logger.info('✅ [AuthController.updateRole] Role updated successfully:', roleId);

      return res.status(200).json({
        success: true,
        message: 'Role updated successfully',
        data: updatedRole,
      });
    } catch (error) {
      logger.error('❌ [AuthController.updateRole] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  // ============================================
  // PERMISSION ENDPOINTS
  // ============================================

  /**
   * Get All Permissions
   * GET /auth/permissions
   * 
   * @description Returns all permissions in the system.
   */
  async getPermissions(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [AuthController.getPermissions] Fetching all permissions...');
      
      const permissions = await this.authRepository.getAllPermissions();

      logger.info('✅ [AuthController.getPermissions] Permissions fetched successfully, count:', permissions.length);

      return res.status(200).json({
        success: true,
        message: 'Permissions fetched successfully',
        data: permissions,
      });
    } catch (error) {
      logger.error('❌ [AuthController.getPermissions] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /**
   * Create Permission
   * POST /auth/permissions
   * 
   * @description Creates a new permission.
   */
  async createPermission(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [AuthController.createPermission] Creating new permission...');
      
      // Validate request body with Zod
      const parseResult = CreatePermissionSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        logger.warn('⚠️ [AuthController.createPermission] Validation failed:', parseResult.error.issues);
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

      const { permissionName, status } = parseResult.data;
      logger.debug('🔍 [AuthController.createPermission] Permission name:', permissionName);

      // Check if permission already exists
      const existingPermission = await this.authRepository.getPermissionByName(permissionName);
      
      if (existingPermission) {
        logger.warn('⚠️ [AuthController.createPermission] Permission already exists:', permissionName);
        return res.status(409).json({
          success: false,
          message: Error.ROLE_PERMISSION_ALREADY_EXISTS,
          data: null,
        });
      }

      // Create permission
      const permissionData: Omit<PermissionType, 'permissionId' | 'createdAt' | 'updatedAt'> = {
        permissionName,
        status,
        createdBy: 'system', // TODO: Get from authenticated user
        updatedBy: 'system',
      };

      const newPermission = await this.authRepository.createPermission(permissionData);

      logger.info('✅ [AuthController.createPermission] Permission created successfully:', permissionName);

      return res.status(201).json({
        success: true,
        message: 'Permission created successfully',
        data: newPermission,
      });
    } catch (error) {
      logger.error('❌ [AuthController.createPermission] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /**
   * Update Permission
   * PUT /auth/permissions/:id
   * 
   * @description Updates an existing permission.
   */
  async updatePermission(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [AuthController.updatePermission] Updating permission...');
      
      // Validate request body with Zod
      const parseResult = UpdatePermissionSchema.safeParse({
        ...req.body,
        permissionId: req.params.id || req.body.permissionId,
      });
      
      if (!parseResult.success) {
        logger.warn('⚠️ [AuthController.updatePermission] Validation failed:', parseResult.error.issues);
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

      const { permissionId, permissionName, status } = parseResult.data;
      logger.debug('🔍 [AuthController.updatePermission] Permission ID:', permissionId);

      // Check if permission exists
      const existingPermission = await this.authRepository.getPermissionById(permissionId);
      
      if (!existingPermission) {
        logger.warn('⚠️ [AuthController.updatePermission] Permission not found:', permissionId);
        return res.status(404).json({
          success: false,
          message: 'Permission not found',
          data: null,
        });
      }

      // Check for name conflict if renaming
      if (permissionName && permissionName !== existingPermission.permissionName) {
        const conflictingPermission = await this.authRepository.getPermissionByName(permissionName);
        if (conflictingPermission) {
          logger.warn('⚠️ [AuthController.updatePermission] Permission name conflict:', permissionName);
          return res.status(409).json({
            success: false,
            message: Error.ROLE_PERMISSION_ALREADY_EXISTS,
            data: null,
          });
        }
      }

      // Update permission
      const updateData: Partial<PermissionType> = {
        ...(permissionName && { permissionName }),
        ...(status && { status }),
        updatedBy: 'system', // TODO: Get from authenticated user
      };

      const updatedPermission = await this.authRepository.updatePermission(permissionId, updateData);

      logger.info('✅ [AuthController.updatePermission] Permission updated successfully:', permissionId);

      return res.status(200).json({
        success: true,
        message: 'Permission updated successfully',
        data: updatedPermission,
      });
    } catch (error) {
      logger.error('❌ [AuthController.updatePermission] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }
}

// Export singleton instance
export { AuthControllerClass };

