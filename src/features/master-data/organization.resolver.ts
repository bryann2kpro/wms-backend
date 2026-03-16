/**
 * Organization GraphQL Resolvers
 *
 * @description Resolver functions for organization operations.
 * Provides CRUD queries and mutations for managing organizations.
 */

import { GraphQLError } from 'graphql';
import { organizationRepository } from './organization.repository';
import { GraphQLContext } from '@/graphql/context';
import { logger } from '@/util/logger';

export const resolvers = {
  Query: {
    /**
     * Get all organizations (Super Admin only)
     */
    organizations: async (
      _: unknown,
      args: {
        filter?: { organizationCode?: string; organizationName?: string; status?: string; search?: string };
        pageSize?: number;
        pageNumber?: number;
      },
      context: GraphQLContext
    ) => {
      // Super Admin can view all organizations
      if (!context.isSuperAdmin) {
        throw new GraphQLError('Only Super Admin can view all organizations', {
          extensions: { code: 'FORBIDDEN', http: { status: 403 } },
        });
      }

      const pageSize = args.pageSize ?? 10;
      const pageNumber = args.pageNumber ?? 1;

      const result = await organizationRepository.getOrganizations(args.filter || {}, {
        pageSize,
        pageNumber,
      });

      return {
        query: result.query,
        pagination: result.pagination,
      };
    },

    /**
     * Get a single organization (Super Admin or members of that org)
     */
    organization: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
      const organization = await organizationRepository.getOrganizationById(id);

      if (!organization) {
        throw new GraphQLError('Organization not found', {
          extensions: { code: 'NOT_FOUND', http: { status: 404 } },
        });
      }

      // Allow Super Admin or users in this organization
      if (!context.isSuperAdmin && context.organizationId !== id) {
        throw new GraphQLError('Access denied', {
          extensions: { code: 'FORBIDDEN', http: { status: 403 } },
        });
      }

      return {
        id: organization.organizationId,
        organizationName: organization.organizationName,
        organizationCode: organization.organizationCode,
        status: organization.status,
        createdAt: organization.createdAt.toISOString(),
        updatedAt: organization.updatedAt.toISOString(),
      };
    },

    /**
     * Get current user's organization
     */
    currentOrganization: async (_: unknown, __: unknown, context: GraphQLContext) => {
      if (!context.user || !context.organizationId) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } },
        });
      }

      const organization = await organizationRepository.getOrganizationById(context.organizationId);

      if (!organization) {
        throw new GraphQLError('Organization not found', {
          extensions: { code: 'NOT_FOUND', http: { status: 404 } },
        });
      }

      return {
        id: organization.organizationId,
        organizationName: organization.organizationName,
        organizationCode: organization.organizationCode,
        status: organization.status,
        createdAt: organization.createdAt.toISOString(),
        updatedAt: organization.updatedAt.toISOString(),
      };
    },
  },

  Mutation: {
    /**
     * Create a new organization (Super Admin only)
     */
    createOrganization: async (
      _: unknown,
      { input }: { input: { organizationName: string; organizationCode: string } },
      context: GraphQLContext
    ) => {
      if (!context.isSuperAdmin) {
        throw new GraphQLError('Only Super Admin can create organizations', {
          extensions: { code: 'FORBIDDEN', http: { status: 403 } },
        });
      }

      // Check if code already exists
      const exists = await organizationRepository.codeExists(input.organizationCode);
      if (exists) {
        throw new GraphQLError('Organization code already exists', {
          extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } },
        });
      }

      const organization = await organizationRepository.createOrganization({
        organizationName: input.organizationName,
        organizationCode: input.organizationCode,
        status: 'active',
        createdBy: context.user?.id || 'system',
        updatedBy: context.user?.id || 'system',
      });

      logger.info(`✅ [Mutation.createOrganization] Organization created: ${input.organizationCode}`);

      return {
        id: organization.organizationId,
        organizationName: organization.organizationName,
        organizationCode: organization.organizationCode,
        status: organization.status,
        createdAt: organization.createdAt.toISOString(),
        updatedAt: organization.updatedAt.toISOString(),
      };
    },

    /**
     * Update an organization (Super Admin only)
     */
    updateOrganization: async (
      _: unknown,
      { id, input }: { id: string; input: { organizationName?: string; status?: string } },
      context: GraphQLContext
    ) => {
      if (!context.isSuperAdmin) {
        throw new GraphQLError('Only Super Admin can update organizations', {
          extensions: { code: 'FORBIDDEN', http: { status: 403 } },
        });
      }

      const organization = await organizationRepository.updateOrganization(id, {
        organizationName: input.organizationName,
        status: input.status,
        updatedBy: context.user?.id || 'system',
        updatedAt: new Date(),
      });

      if (!organization) {
        throw new GraphQLError('Organization not found', {
          extensions: { code: 'NOT_FOUND', http: { status: 404 } },
        });
      }

      logger.info(`✅ [Mutation.updateOrganization] Organization updated: ${id}`);

      return {
        id: organization.organizationId,
        organizationName: organization.organizationName,
        organizationCode: organization.organizationCode,
        status: organization.status,
        createdAt: organization.createdAt.toISOString(),
        updatedAt: organization.updatedAt.toISOString(),
      };
    },
  },
};
