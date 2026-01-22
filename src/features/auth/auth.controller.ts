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
  type RoleInsertType,
  type PermissionInsertType,
} from './auth.repository.js';
import { UserInsertType } from './auth.model.js';
import { JwtControllerClass } from '@/features/jwt/jwt.controller.js';
import { Error } from '@/error/index.js';
import { hashPassword, comparePassword } from '@/util/password.js';
import { logger } from '@/util/logger.js';
import { db } from '@/db/index.js';

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
  roleName: z.string().min(1, 'Role name is required').max(50),
  status: z.string().max(20).default('active'),
  permissionIds: z.array(z.uuid()).optional(),
});

/**
 * Update role request schema
 */
const UpdateRoleSchema = z.object({
  roleId: z.uuid('Invalid role ID format'),
  roleName: z.string().min(1).max(50).optional(),
  status: z.string().max(20).optional(),
  permissionIds: z.array(z.uuid()).optional(),
});

/**
 * Create permission request schema
 */
const CreatePermissionSchema = z.object({
  moduleId: z.uuid('Invalid module ID format'),
  permissionType: z.string().min(1, 'Permission type is required').max(50),
  description: z.string().max(255).optional(),
  status: z.string().max(20).default('active'),
});

/**
 * Update permission request schema
 */
const UpdatePermissionSchema = z.object({
  permissionId: z.uuid('Invalid permission ID format'),
  permissionType: z.string().min(1).max(50).optional(),
  description: z.string().max(255).optional(),
  status: z.string().max(20).optional(),
});

// ============================================
// CONTROLLER CLASS
// ============================================

class AuthControllerClass {

  constructor(
    private authRepository: AuthRepositoryClass, 
    private jwtController: JwtControllerClass
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

      const { email, password } = parseResult.data;
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
      const roles = await this.authRepository.getUserRoles(user.id);

      // Get user's permissions via roles
      const permissions = await this.authRepository.getUserPermissions(user.id);

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
          roles: roles.map(r => ({
            roleId: r.roleId,
            roleName: r.roleName,
          })),
          permissions: permissions.map(p => ({
            permissionId: p.permissionId,
            permissionType: p.permissionType,
            moduleName: p.moduleName,
          })),
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
   */
  async getRoles(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [AuthController.getRoles] Fetching all roles...');
      
      const roles = await this.authRepository.getAllRoles();

      logger.info('✅ [AuthController.getRoles] Roles fetched successfully, count:', roles.length);

      return res.status(200).json({
        success: true,
        message: 'Roles fetched successfully',
        count: roles.length,
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
   * @description Creates a new role with optional permissions.
   */
  async createRole(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [AuthController.createRole] Creating new role...');
      
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

      const { roleName, status, permissionIds } = parseResult.data;
      logger.debug('🔍 [AuthController.createRole] Role name:', roleName);

      const existingRole = await this.authRepository.getRoleByName(roleName);
      
      if (existingRole) {
        logger.warn('⚠️ [AuthController.createRole] Role already exists:', roleName);
        return res.status(409).json({
          success: false,
          message: Error.USER_ROLE_ALREADY_EXISTS,
          data: null,
        });
      }

      // Use transaction to create role and assign permissions
      const result = await db.transaction(async (tx) => {
        const roleData: Omit<RoleInsertType, 'roleId' | 'createdAt' | 'updatedAt'> = {
          roleName,
          status,
          createdBy: 'system', // TODO: Get from authenticated user
          updatedBy: 'system',
        };

        const newRole = await this.authRepository.createRole(roleData, tx);

        // Assign permissions if provided
        if (permissionIds && permissionIds.length > 0) {
          await this.authRepository.updateRolePermissions(
            newRole.roleId,
            permissionIds,
            'system',
            'system',
            tx
          );
        }

        return newRole;
      });

      // Get permissions for response
      const permissions = await this.authRepository.getRolePermissions(result.roleId);

      logger.info('✅ [AuthController.createRole] Role created successfully:', roleName);

      return res.status(201).json({
        success: true,
        message: 'Role created successfully',
        data: {
          ...result,
          permissionIds: permissions.map(p => p.permissionId),
        },
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
   * @description Updates an existing role and its permissions.
   */
  async updateRole(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [AuthController.updateRole] Updating role...');
      
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

      const { roleId, roleName, status, permissionIds } = parseResult.data;
      logger.debug('🔍 [AuthController.updateRole] Role ID:', roleId);

      const existingRole = await this.authRepository.getRoleById(roleId);
      
      if (!existingRole) {
        logger.warn('⚠️ [AuthController.updateRole] Role not found:', roleId);
        return res.status(404).json({
          success: false,
          message: 'Role not found',
          data: null,
        });
      }

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

      // Use transaction to update role and permissions
      const result = await db.transaction(async (tx) => {
        const updateData: Partial<RoleInsertType> = {
          ...(roleName && { roleName }),
          ...(status && { status }),
          updatedBy: 'system', // TODO: Get from authenticated user
        };

        const updatedRole = await this.authRepository.updateRole(roleId, updateData, tx);

        // Update permissions if provided
        if (permissionIds !== undefined) {
          await this.authRepository.updateRolePermissions(
            roleId,
            permissionIds,
            'system',
            'system',
            tx
          );
        }

        return updatedRole;
      });

      // Get permissions for response
      const permissions = await this.authRepository.getRolePermissions(roleId);

      logger.info('✅ [AuthController.updateRole] Role updated successfully:', roleId);

      return res.status(200).json({
        success: true,
        message: 'Role updated successfully',
        data: {
          ...result,
          permissionIds: permissions.map(p => p.permissionId),
        },
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
  // MODULE ENDPOINTS
  // ============================================

  /**
   * Get All Modules with Permissions
   * GET /auth/modules
   */
  async getModules(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [AuthController.getModules] Fetching all modules...');
      
      const modules = await this.authRepository.getModulesWithPermissions();

      // Group by moduleName
      const groupedModules = modules.reduce((acc, curr) => {
        const existingModule = acc.find(item => item.moduleName === curr.moduleName);
        
        if (existingModule && curr.permissionId) {
          existingModule.permissions.push({
            permissionId: curr.permissionId,
            permissionType: curr.permissionType,
            description: curr.description || '',
          });
        } else if (curr.moduleName) {
          acc.push({
            moduleId: curr.moduleId,
            moduleName: curr.moduleName,
            permissions: curr.permissionId ? [{
              permissionId: curr.permissionId,
              permissionType: curr.permissionType,
              description: curr.description || '',
            }] : [],
            status: curr.status,
            createdAt: curr.createdAt.toISOString(),
            updatedAt: curr.updatedAt.toISOString(),
            createdBy: curr.createdBy,
            updatedBy: curr.updatedBy,
          });
        }
        return acc;
      }, [] as Array<{
        moduleId: string;
        moduleName: string;
        permissions: Array<{ permissionId: string; permissionType: string; description: string }>;
        status: string;
        createdAt: string;
        updatedAt: string;
        createdBy: string;
        updatedBy: string;
      }>);

      logger.info('✅ [AuthController.getModules] Modules fetched successfully, count:', groupedModules.length);

      return res.status(200).json({
        success: true,
        message: 'Modules fetched successfully',
        count: groupedModules.length,
        data: groupedModules,
      });
    } catch (error) {
      logger.error('❌ [AuthController.getModules] Error:', error);
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
   */
  async getPermissions(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [AuthController.getPermissions] Fetching all permissions...');
      
      const permissions = await this.authRepository.getAllPermissions();

      logger.info('✅ [AuthController.getPermissions] Permissions fetched successfully, count:', permissions.length);

      return res.status(200).json({
        success: true,
        message: 'Permissions fetched successfully',
        count: permissions.length,
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
   */
  async createPermission(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [AuthController.createPermission] Creating new permission...');
      
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

      const { moduleId, permissionType, description, status } = parseResult.data;
      logger.debug('🔍 [AuthController.createPermission] Permission type:', permissionType);

      const permissionData: Omit<PermissionInsertType, 'permissionId' | 'createdAt' | 'updatedAt'> = {
        moduleId,
        permissionType,
        description,
        status,
        createdBy: 'system', // TODO: Get from authenticated user
        updatedBy: 'system',
      };

      const newPermission = await this.authRepository.createPermission(permissionData);

      logger.info('✅ [AuthController.createPermission] Permission created successfully');

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
   */
  async updatePermission(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [AuthController.updatePermission] Updating permission...');
      
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

      const { permissionId, permissionType, description, status } = parseResult.data;
      logger.debug('🔍 [AuthController.updatePermission] Permission ID:', permissionId);

      const existingPermission = await this.authRepository.getPermissionById(permissionId);
      
      if (!existingPermission) {
        logger.warn('⚠️ [AuthController.updatePermission] Permission not found:', permissionId);
        return res.status(404).json({
          success: false,
          message: 'Permission not found',
          data: null,
        });
      }

      const updateData: Partial<PermissionInsertType> = {
        ...(permissionType && { permissionType }),
        ...(description !== undefined && { description }),
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

  // ============================================
  // ROLE PERMISSION ENDPOINTS
  // ============================================

  /**
   * Get Role Permissions
   * GET /auth/roles/:id/permissions
   */
  async getRolePermissions(req: Request, res: Response) {
    try {
      const roleId = req.params.id;
      logger.info('ℹ️ [AuthController.getRolePermissions] Fetching permissions for role:', roleId);
      
      const role = await this.authRepository.getRoleById(roleId);
      
      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found',
          data: null,
        });
      }

      const permissions = await this.authRepository.getRolePermissions(roleId);
      const modules = await this.authRepository.getModulesWithPermissions();

      // Create a map of existing role permissions
      const existingPermissions = new Set(permissions.map(p => p.permissionId));

      // Group by module and mark which permissions are assigned
      const modulePermissions = modules.reduce((acc, curr) => {
        if (!curr.moduleName || !curr.permissionId) return acc;

        const existing = acc.find(m => m.moduleName === curr.moduleName);
        const permissionData = {
          permissionId: curr.permissionId,
          permissionType: curr.permissionType,
          hasPermission: existingPermissions.has(curr.permissionId),
        };

        if (existing) {
          existing.permissions.push(permissionData);
        } else {
          acc.push({
            moduleName: curr.moduleName,
            permissions: [permissionData],
          });
        }
        return acc;
      }, [] as Array<{
        moduleName: string;
        permissions: Array<{ permissionId: string; permissionType: string; hasPermission: boolean }>;
      }>);

      logger.info('✅ [AuthController.getRolePermissions] Role permissions fetched successfully');

      return res.status(200).json({
        success: true,
        message: 'Role permissions fetched successfully',
        data: {
          roleId: role.roleId,
          roleName: role.roleName,
          modules: modulePermissions,
        },
      });
    } catch (error) {
      logger.error('❌ [AuthController.getRolePermissions] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }
}

// Export class for DI
export { AuthControllerClass };
