/**
 * Pickup Criteria GraphQL Resolvers
 *
 * @description Resolver functions for PickupCriteria operations.
 * Uses PickupCriteriaRepository for data access.
 */

import { pickupCriteriasRepository } from '@/composition-root';
import { PickupCriteriaFilter } from './pickup-criteria.repository';
import { withAudit } from '../audit-log/audit.wrapper';
import { GraphQLContext } from '@/graphql/context';
import { prettifyError, z } from 'zod';
import { GraphQLError } from 'graphql';

const pickupCriteriaFilterSchema = z.object({
  id: z.string().uuid().optional(),
  skuId: z.string().uuid().optional(),
  strategy: z.string().optional(),
});

const createPickupCriteriaSchema = z.object({
  skuId: z.string().uuid('skuId must be a valid UUID'),
  strategy: z.enum(['FIFO', 'LIFO', 'FEFO']).optional().default('FIFO'),
  priorityOverride: z.boolean().optional().default(false),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
});

const updatePickupCriteriaSchema = z.object({
  strategy: z.enum(['FIFO', 'LIFO', 'FEFO']).optional(),
  priorityOverride: z.boolean().optional(),
  updatedBy: z.string().min(1),
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function transformPickupCriteria(record: {
  id: string;
  skuId: string;
  strategy: string;
  priorityOverride: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}) {
  return {
    id: record.id,
    skuId: record.skuId,
    strategy: record.strategy,
    priorityOverride: record.priorityOverride,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    createdBy: record.createdBy,
    updatedBy: record.updatedBy,
  };
}

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  Query: {
    /**
     * Get pickup criterias with optional filtering and pagination
     */
    pickupCriterias: async (_: unknown, args: {
      filter?: {
        id?: string;
        skuId?: string;
        strategy?: string;
      };
      pageSize?: number;
      pageNumber?: number;
    }, context: GraphQLContext) => {
      const filter: PickupCriteriaFilter = {};

      if (args.filter) {
        const { success, data, error } = pickupCriteriaFilterSchema.safeParse(args.filter);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        if (data.id) filter.id = data.id;
        if (data.skuId) filter.skuId = data.skuId;
        if (data.strategy) filter.strategy = data.strategy;
      }

      const result = await pickupCriteriasRepository.getPickupCriterias(filter, {
        pageSize: args.pageSize,
        pageNumber: args.pageNumber,
      }, context.organizationId || undefined);

      return {
        query: result.query.map(transformPickupCriteria),
        pagination: result.pagination,
      };
    },

    /**
     * Get a single pickup criteria by ID
     */
    pickupCriteria: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
      const record = await pickupCriteriasRepository.getPickupCriteriaById(id, context.organizationId || undefined);
      if (!record) return null;
      return transformPickupCriteria(record);
    },
  },

  Mutation: {
    /**
     * Create a new pickup criteria
     */
    createPickupCriteria: withAudit(
      {
        entity: 'PickupCriteria',
        action: 'CREATE',
        getEntityId: (result) => result?.id ?? null,
      },
      async (_: unknown, { input }: { input: {
        skuId: string;
        strategy?: string;
        priorityOverride?: boolean;
        createdBy: string;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        if (!context.organizationId) {
          throw new GraphQLError('Organization context is required', {
            extensions: { code: 'UNAUTHORIZED', http: { status: 401 } },
          });
        }
        const { success, data, error } = createPickupCriteriaSchema.safeParse(input);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        const record = await pickupCriteriasRepository.createPickupCriteria({
          organizationId: context.organizationId,
          skuId: data.skuId,
          strategy: data.strategy,
          priorityOverride: data.priorityOverride,
          createdBy: data.createdBy,
          updatedBy: data.updatedBy,
        }, context.organizationId, context.tx);
        return record ? transformPickupCriteria(record) : null;
      },
    ),

    /**
     * Update an existing pickup criteria
     */
    updatePickupCriteria: withAudit(
      {
        entity: 'PickupCriteria',
        action: 'UPDATE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args, context) => {
          return await pickupCriteriasRepository.getPickupCriteriaById(args.id, (context as GraphQLContext).organizationId || undefined);
        },
      },
      async (_: unknown, { id, input }: { id: string; input: {
        strategy?: string;
        priorityOverride?: boolean;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        const { success: uSuccess, data: uData, error: uError } = updatePickupCriteriaSchema.safeParse(input);
        if (!uSuccess) {
          throw new GraphQLError(prettifyError(uError), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        const record = await pickupCriteriasRepository.updatePickupCriteria({
          strategy: uData.strategy,
          priorityOverride: uData.priorityOverride,
          updatedBy: uData.updatedBy,
        }, id, context.organizationId || undefined, context.tx);
        if (!record) return null;
        return transformPickupCriteria(record);
      },
    ),

    /**
     * Delete a pickup criteria
     */
    deletePickupCriteria: withAudit(
      {
        entity: 'PickupCriteria',
        action: 'DELETE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args, context) => {
          return await pickupCriteriasRepository.getPickupCriteriaById(args.id, (context as GraphQLContext).organizationId || undefined);
        },
      },
      async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        return await pickupCriteriasRepository.deletePickupCriteria(id, context.organizationId || undefined, context.tx);
      },
    ),
  },
};
