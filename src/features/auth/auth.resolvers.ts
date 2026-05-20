/**
 * Auth GraphQL Resolvers
 *
 * @description Resolver functions for authentication and user operations.
 * All DB access is in AuthRepository (filter, sort, search, pagination in getUsersPaginated).
 * Type definitions are in auth.typeDefs.ts
 */

import type { UserType } from './auth.model';
import { authRepository, jwtController } from '@/composition-root';
import type { GraphQLContext } from '@/graphql/context';
import { comparePassword, hashPassword } from '@/util/password';
import { GraphQLError } from 'graphql';
import { logger } from '@/util/logger';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const createUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  displayName: z.string().min(1, 'Display name is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  roleId: z.string().uuid('Invalid role ID'),
  organizationId: z.string().uuid('Invalid organization ID'),
  contactNo: z.string().optional().nullable(),
});

const updateUserSchema = z.object({
  displayName: z.string().min(1).optional().nullable(),
  contactNo: z.string().optional().nullable(),
  isActive: z.boolean().optional().nullable(),
  roleId: z.string().uuid().optional().nullable(),
  password: z.string().min(6).optional().nullable(),
});

// ============================================
// TYPES (match GraphQL schema)
// ============================================

type UserFilter = {
  email?: string;
  displayName?: string;
  isActive?: boolean;
  roleId?: string;
};

type UserSort = {
  field: 'EMAIL' | 'DISPLAY_NAME' | 'CREATED_AT' | 'UPDATED_AT';
  direction: 'ASC' | 'DESC';
};

type PaginationInput = {
  page?: number;
  pageSize?: number;
};

// ============================================
// HELPERS (transform only; no DB)
// ============================================

function groupRolesByUserId(
  rows: Array<{ userId: string; roleId: string; roleName: string }>,
): Map<string, Array<{ roleId: string; roleName: string }>> {
  const map = new Map<string, Array<{ roleId: string; roleName: string }>>();
  for (const row of rows) {
    const existing = map.get(row.userId) || [];
    existing.push({ roleId: row.roleId, roleName: row.roleName });
    map.set(row.userId, existing);
  }
  return map;
}

function transformUser(user: UserType, roles: Array<{ roleId: string; roleName: string }>) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    contactNo: user.contactNo,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    createdBy: user.createdBy,
    updatedBy: user.updatedBy,
    roles,
  };
}

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  Query: {
    /**
     * Get all users with filtering, sorting, and pagination. DB in repository (getUsersPaginated).
     * Only returns users belonging to the caller's organization.
     */
    users: async (
      _: unknown,
      args: { filter?: UserFilter; sort?: UserSort; pagination?: PaginationInput },
      context: GraphQLContext,
    ) => {
      const page = args.pagination?.page ?? 1;
      const pageSize = args.pagination?.pageSize ?? 10;

      const { users, totalCount } = await authRepository.getUsersPaginated({
        filter: args.filter,
        sort: args.sort,
        page,
        pageSize,
        organizationId: context.organizationId ?? undefined,
      });

      const userIds = users.map((u) => u.id);
      const rolesRows = await authRepository.getRolesForUserIds(userIds);
      const rolesMap = groupRolesByUserId(rolesRows);

      const data = users.map((user) => {
        const roles = rolesMap.get(user.id) ?? [];
        return transformUser(user, roles);
      });

      const totalPages = Math.ceil(totalCount / pageSize);
      return {
        data,
        pagination: {
          currentPage: page,
          pageSize,
          totalCount,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      };
    },

    /**
     * Get a single user by ID (uses repository).
     * Returns null if the user belongs to a different organization.
     */
    user: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
      const user = await authRepository.getUserById(id);
      if (!user) return null;
      if (
        context.organizationId != null &&
        user.primaryOrganizationId !== context.organizationId
      ) {
        return null;
      }

      const roles = await authRepository.getUserRoles(id);
      return transformUser(user, roles.map(r => ({ roleId: r.roleId, roleName: r.roleName })));
    },

    /**
     * Get a user by email (uses repository).
     * Returns null if the user belongs to a different organization.
     */
    userByEmail: async (_: unknown, { email }: { email: string }, context: GraphQLContext) => {
      const user = await authRepository.getUserByEmail(email);
      if (!user) return null;
      if (
        context.organizationId != null &&
        user.primaryOrganizationId !== context.organizationId
      ) {
        return null;
      }

      const roles = await authRepository.getUserRoles(user.id);
      return transformUser(user, roles.map(r => ({ roleId: r.roleId, roleName: r.roleName })));
    },
  },

  Mutation: {
    /**
     * Login with email and password
     * Returns JWT tokens on success
     */
    login: async (_: unknown, { input }: { input: { email: string; password: string } }) => {
      const { success, data, error } = loginSchema.safeParse(input);
      if (!success) {
        throw new GraphQLError('Validation failed', { extensions: { code: 'BAD_USER_INPUT', errors: error.flatten().fieldErrors } });
      }
      const { email, password } = data;
      
      logger.info('ℹ️ [GraphQL.login] Processing login request...');
      logger.debug('🔍 [GraphQL.login] Attempting login for:', email);

      // Find user by email
      const user = await authRepository.getUserByEmail(email);

      if (!user) {
        logger.warn('⚠️ [GraphQL.login] User not found:', email);
        throw new GraphQLError('Invalid email or password', {
          extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } },
        });
      }

      // Check if account is active
      if (!user.isActive) {
        logger.warn('⚠️ [GraphQL.login] Account deactivated:', email);
        throw new GraphQLError('Account is deactivated', {
          extensions: { code: 'FORBIDDEN', http: { status: 403 } },
        });
      }

      // Verify password
      const isPasswordValid = await comparePassword(password, user.passwordHash);
      
      if (!isPasswordValid) {
        logger.warn('⚠️ [GraphQL.login] Invalid password for:', email);
        throw new GraphQLError('Invalid email or password', {
          extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } },
        });
      }

      // Generate tokens
      if (!user.primaryOrganizationId) {
        throw new GraphQLError('User has no organization assigned. Contact your administrator.', {
          extensions: { code: 'UNAUTHORIZED', http: { status: 401 } },
        });
      }

      const tokenPayload = {
        username: email,
        loginType: 'EMAIL' as const,
        organizationId: user.primaryOrganizationId,
      };
      const accessToken = jwtController.generateAccessToken(tokenPayload);
      const refreshToken = jwtController.generateRefreshToken(tokenPayload);
      const decodedToken = jwtController.verifyToken(accessToken);

      // Get user roles
      const roles = await authRepository.getUserRoles(user.id);

      logger.info('✅ [GraphQL.login] Login successful for:', email);

      return {
        accessToken,
        refreshToken,
        expiresAt: decodedToken.exp 
          ? new Date(decodedToken.exp * 1000).toISOString() 
          : new Date(Date.now() + 3600000).toISOString(), // 1 hour default
        user: transformUser(user, roles.map(r => ({ roleId: r.roleId, roleName: r.roleName }))),
      };
    },

    /**
     * Create a new user and assign role. Uses transaction for user + UserRole.
     */
    createUser: async (_: unknown, { input }: { input: { email: string; displayName: string; password: string; roleId: string; organizationId: string; contactNo?: string | null } }) => {
      const { success, data, error } = createUserSchema.safeParse(input);
      if (!success) {
        throw new GraphQLError('Validation failed', { extensions: { code: 'BAD_USER_INPUT', errors: error.flatten().fieldErrors } });
      }
      const { email, displayName, password, roleId, organizationId, contactNo } = data;
      logger.info('ℹ️ [GraphQL.createUser] Creating user...', email);

      const existing = await authRepository.getUserByEmail(email);
      if (existing) {
        logger.warn('⚠️ [GraphQL.createUser] User with this email already exists:', email);
        throw new GraphQLError('User with this email already exists', {
          extensions: { code: 'BAD_USER_INPUT', http: { status: 409 } },
        });
      }

      const role = await authRepository.getRoleById(roleId);
      if (!role) {
        logger.warn('⚠️ [GraphQL.createUser] Invalid role ID:', roleId);
        throw new GraphQLError('Invalid role ID', {
          extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } },
        });
      }

      const passwordHash = await hashPassword(password);

      const userData = {
        email,
        displayName,
        passwordHash,
        contactNo: contactNo ?? null,
        isActive: true,
        primaryOrganizationId: organizationId,
        createdBy: 'system',
        updatedBy: 'system',
      };
      const result = await authRepository.createUserWithRole(userData, roleId);

      const roles = await authRepository.getUserRoles(result.id);
      logger.info('✅ [GraphQL.createUser] User created:', email);
      return transformUser(result, roles.map(r => ({ roleId: r.roleId, roleName: r.roleName })));
    },

    /**
     * Update user. Optionally update password (hashed) and/or role (replaces current role assignment).
     */
    updateUser: async (_: unknown, { id, input }: { id: string; input: { displayName?: string | null; contactNo?: string | null; isActive?: boolean | null; roleId?: string | null; password?: string | null } }) => {
      const { success, data, error } = updateUserSchema.safeParse(input);
      if (!success) {
        throw new GraphQLError('Validation failed', { extensions: { code: 'BAD_USER_INPUT', errors: error.flatten().fieldErrors } });
      }
      logger.info('ℹ️ [GraphQL.updateUser] Updating user:', id);

      const user = await authRepository.getUserById(id);
      if (!user) {
        logger.warn('⚠️ [GraphQL.updateUser] User not found:', id);
        throw new GraphQLError('User not found', {
          extensions: { code: 'NOT_FOUND', http: { status: 404 } },
        });
      }

      if (data.roleId != null && data.roleId !== '') {
        const role = await authRepository.getRoleById(data.roleId);
        if (!role) {
          logger.warn('⚠️ [GraphQL.updateUser] Invalid role ID:', data.roleId);
          throw new GraphQLError('Invalid role ID', { extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } } });
        }
      }

      const updateData: Record<string, unknown> = { updatedBy: 'system' };
      if (data.displayName !== undefined) updateData.displayName = data.displayName;
      if (data.contactNo !== undefined) updateData.contactNo = data.contactNo;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;
      if (data.password != null && data.password !== '') {
        updateData.passwordHash = await hashPassword(data.password);
      }

      const updated = await authRepository.updateUserWithRole(
        id,
        updateData as Parameters<typeof authRepository.updateUser>[1],
        { roleId: data.roleId }
      );
      const roles = updated ? await authRepository.getUserRoles(id) : [];
      logger.info('✅ [GraphQL.updateUser] User updated:', id);
      return updated ? transformUser(updated, roles.map(r => ({ roleId: r.roleId, roleName: r.roleName }))) : null;
    },
  },

  User: {
    /**
     * Resolve roles field for User type (for nested queries)
     */
    roles: async (parent: { id: string; roles?: Array<{ roleId: string; roleName: string }> }) => {
      // If roles are already resolved, return them
      if (parent.roles) return parent.roles;
      
      // Otherwise, fetch from repository
      const roles = await authRepository.getUserRoles(parent.id);
      return roles.map(r => ({ roleId: r.roleId, roleName: r.roleName }));
    },
  },
};
