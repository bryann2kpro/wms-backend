/**
 * Auth GraphQL Resolvers
 * 
 * @description Resolver functions for authentication and user operations.
 * Uses AuthRepository for data access (proper layer separation).
 * 
 * Type definitions are in auth.typeDefs.ts
 */

import { db } from '@/db';
import { UsersTable } from './auth.model';
import { UserRole, Role } from '@/features/rbac/rbac.model';
import { eq, and, inArray, like, asc, desc, SQL } from 'drizzle-orm';
import { authRepository, jwtController } from '@/composition-root';
import { comparePassword } from '@/util/password';
import { GraphQLError } from 'graphql';
import { logger } from '@/util/logger';

// ============================================
// TYPES
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
// HELPER FUNCTIONS (batch loading to avoid N+1)
// ============================================

/**
 * Batch load roles for multiple users in a single query
 * @param userIds - Array of user IDs to fetch roles for
 * @returns Map of userId -> roles array
 */
async function getRolesForUsers(userIds: string[]): Promise<Map<string, Array<{ roleId: string; roleName: string }>>> {
  if (userIds.length === 0) return new Map();

  const results = await db
    .select({
      userId: UserRole.userId,
      roleId: Role.roleId,
      roleName: Role.roleName,
    })
    .from(UserRole)
    .innerJoin(Role, eq(UserRole.roleId, Role.roleId))
    .where(and(
      inArray(UserRole.userId, userIds),
      eq(UserRole.status, 'active')
    ));

  // Group results by userId
  const rolesMap = new Map<string, Array<{ roleId: string; roleName: string }>>();
  
  for (const row of results) {
    const existing = rolesMap.get(row.userId) || [];
    existing.push({ roleId: row.roleId, roleName: row.roleName });
    rolesMap.set(row.userId, existing);
  }

  return rolesMap;
}

/**
 * Transform user data for GraphQL response
 */
function transformUser(user: typeof UsersTable.$inferSelect, roles: Array<{ roleId: string; roleName: string }>) {
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
     * Get all users with filtering, sorting, and pagination
     */
    users: async (_: unknown, args: { 
      filter?: UserFilter; 
      sort?: UserSort; 
      pagination?: PaginationInput;
    }) => {
      const { filter, sort, pagination } = args;
      
      // Build WHERE conditions
      const conditions: SQL[] = [];
      
      if (filter?.email) {
        conditions.push(like(UsersTable.email, `%${filter.email}%`));
      }
      if (filter?.displayName) {
        conditions.push(like(UsersTable.displayName, `%${filter.displayName}%`));
      }
      if (filter?.isActive !== undefined) {
        conditions.push(eq(UsersTable.isActive, filter.isActive));
      }
      
      // If filtering by roleId, we need to get userIds with that role first
      let userIdsWithRole: string[] | null = null;
      if (filter?.roleId) {
        const usersWithRole = await db
          .select({ userId: UserRole.userId })
          .from(UserRole)
          .where(and(
            eq(UserRole.roleId, filter.roleId),
            eq(UserRole.status, 'active')
          ));
        userIdsWithRole = usersWithRole.map(u => u.userId);
        
        if (userIdsWithRole.length === 0) {
          // No users with this role
          return {
            data: [],
            pagination: {
              currentPage: pagination?.page || 1,
              pageSize: pagination?.pageSize || 10,
              totalCount: 0,
              totalPages: 0,
              hasNextPage: false,
              hasPrevPage: false,
            },
          };
        }
        conditions.push(inArray(UsersTable.id, userIdsWithRole));
      }
      
      // Build ORDER BY
      const sortColumn = sort?.field === 'EMAIL' ? UsersTable.email
        : sort?.field === 'DISPLAY_NAME' ? UsersTable.displayName
        : sort?.field === 'UPDATED_AT' ? UsersTable.updatedAt
        : UsersTable.createdAt; // default
      
      const sortDirection = sort?.direction === 'DESC' ? desc : asc;
      
      // Get total count for pagination
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const allUsers = await db
        .select()
        .from(UsersTable)
        .where(whereClause);
      
      const totalCount = allUsers.length;
      
      // Pagination
      const page = pagination?.page || 1;
      const pageSize = pagination?.pageSize || 10;
      const offset = (page - 1) * pageSize;
      const totalPages = Math.ceil(totalCount / pageSize);
      
      // Query with filter, sort, pagination
      const users = await db
        .select()
        .from(UsersTable)
        .where(whereClause)
        .orderBy(sortDirection(sortColumn))
        .limit(pageSize)
        .offset(offset);
      
      // Batch load roles for the paginated users
      const userIds = users.map(u => u.id);
      const rolesMap = await getRolesForUsers(userIds);
      
      // Transform users with roles
      const data = users.map(user => {
        const roles = rolesMap.get(user.id) || [];
        return transformUser(user, roles);
      });

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
     * Get a single user by ID (uses repository)
     */
    user: async (_: unknown, { id }: { id: string }) => {
      const user = await authRepository.getUserById(id);
      if (!user) return null;

      const roles = await authRepository.getUserRoles(id);
      return transformUser(user, roles.map(r => ({ roleId: r.roleId, roleName: r.roleName })));
    },

    /**
     * Get a user by email (uses repository)
     */
    userByEmail: async (_: unknown, { email }: { email: string }) => {
      const user = await authRepository.getUserByEmail(email);
      if (!user) return null;

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
      const { email, password } = input;
      
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
      const tokenPayload = { username: email, loginType: 'EMAIL' as const };
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
