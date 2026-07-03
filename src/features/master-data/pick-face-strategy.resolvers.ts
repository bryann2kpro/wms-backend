/**
 * Pick Face Strategy GraphQL Resolvers
 *
 * @description Resolver functions for Pick Face Strategy operations.
 * Uses PickFaceStrategyRepository for data access.
 */

import { pickFaceStrategiesRepository } from '@/composition-root';
import { PickFaceStrategyFilter, PickFaceStrategySort } from './pick-face-strategy.repository';
import { withAudit } from '../audit-log/audit.wrapper';
import { GraphQLContext } from '@/graphql/context';
import { prettifyError, z } from 'zod';
import { GraphQLError } from 'graphql';

const pickFaceStrategySortSchema = z.object({
  sortBy: z.enum(['STORAGE_BIN', 'ITEM_CODE', 'BIN_TYPE', 'UPDATED_AT', 'CREATED_AT']).optional(),
  sortOrder: z.enum(['ASC', 'DESC']).optional(),
});

const pickFaceStrategyFilterSchema = z.object({
  id: z.string().uuid().optional(),
  skuId: z.string().uuid().optional(),
  storageBinId: z.string().uuid().optional(),
  binType: z.string().optional(),
  search: z.string().optional(),
});

const createPickFaceStrategySchema = z.object({
  skuId: z.string().uuid(),
  storageBinId: z.string().uuid(),
  itemCode: z.string().min(1),
  binType: z.string().optional().default('FIXED_BIN'),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
});

const updatePickFaceStrategySchema = z.object({
  skuId: z.string().uuid().optional(),
  storageBinId: z.string().uuid().optional(),
  binType: z.string().optional(),
  isActive: z.boolean().optional(),
  updatedBy: z.string().min(1),
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function transformPickFaceStrategy(strategy: {
  id: string;
  skuId: string;
  storageBinId: string;
  binType: string;
  itemCode: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  storageBin?: string | null;
  skuDescription?: string | null;
  rackRow?: string | null;
  rackColumn?: string | null;
  rackLevel?: string | null;
}) {
  const storageBinName = strategy.storageBin || 
    (strategy.rackRow && strategy.rackLevel && strategy.rackColumn 
      ? `${strategy.rackRow}-${strategy.rackLevel}-${strategy.rackColumn}` 
      : null);

  return {
    id: strategy.id,
    skuId: strategy.skuId,
    storageBinId: strategy.storageBinId,
    binType: strategy.binType,
    itemCode: strategy.itemCode,
    storageBin: storageBinName,
    skuDescription: strategy.skuDescription ?? null,
    isActive: strategy.isActive,
    createdAt: strategy.createdAt.toISOString(),
    updatedAt: strategy.updatedAt.toISOString(),
    createdBy: strategy.createdBy,
    updatedBy: strategy.updatedBy,
  };
}

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  Query: {
    /**
     * Get pick face strategies with optional filtering and pagination
     */
    pickFaceStrategies: async (_: unknown, args: {
      filter?: {
        id?: string;
        skuId?: string;
        storageBinId?: string;
        binType?: string;
      };
      sort?: {
        sortBy?: PickFaceStrategySort['sortBy'];
        sortOrder?: PickFaceStrategySort['sortOrder'];
      };
      pageSize?: number;
      pageNumber?: number;
    }, context: GraphQLContext) => {
      const filter: PickFaceStrategyFilter = {};
      const sort: PickFaceStrategySort = {};

      if (args.filter) {
        const { success, data, error } = pickFaceStrategyFilterSchema.safeParse(args.filter);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        if (data.id) filter.id = data.id;
        if (data.skuId) filter.skuId = data.skuId;
        if (data.storageBinId) filter.storageBinId = data.storageBinId;
        if (data.binType) filter.binType = data.binType;
        if (data.search?.trim()) filter.search = data.search.trim();
      }

      if (args.sort) {
        const { success, data, error } = pickFaceStrategySortSchema.safeParse(args.sort);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        Object.assign(sort, data);
      }

      const result = await pickFaceStrategiesRepository.getPickFaceStrategies(filter, sort, {
        pageSize: args.pageSize,
        pageNumber: args.pageNumber,
      }, context.organizationId || undefined, sort);

      return {
        query: result.query.map(transformPickFaceStrategy),
        pagination: result.pagination,
      };
    },

    /**
     * Get a single pick face strategy by ID
     */
    pickFaceStrategy: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
      const strategy = await pickFaceStrategiesRepository.getPickFaceStrategyById(id, context.organizationId || undefined);
      if (!strategy) return null;
      return transformPickFaceStrategy(strategy);
    },
  },

  Mutation: {
    /**
     * Create a new pick face strategy
     */
    createPickFaceStrategy: withAudit(
      {
        entity: 'PickFaceStrategy',
        action: 'CREATE',
        getEntityId: (result) => result?.id ?? null,
      },
      async (_: unknown, { input }: { input: {
        skuId: string;
        storageBinId: string;
        itemCode: string;
        binType?: string;
        createdBy: string;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        if (!context.organizationId) {
          throw new GraphQLError('Organization context is required', {
            extensions: { code: 'UNAUTHORIZED', http: { status: 401 } },
          });
        }
        const { success, data, error } = createPickFaceStrategySchema.safeParse(input);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        const strategy = await pickFaceStrategiesRepository.createPickFaceStrategy({
          organizationId: context.organizationId,
          skuId: data.skuId,
          storageBinId: data.storageBinId,
          itemCode: data.itemCode,
          binType: data.binType,
          createdBy: data.createdBy,
          updatedBy: data.updatedBy,
        }, context.organizationId, context.tx);
        if (!strategy) return null;
        const populated = await pickFaceStrategiesRepository.getPickFaceStrategyById(strategy.id, context.organizationId);
        return populated ? transformPickFaceStrategy(populated) : transformPickFaceStrategy(strategy);
      },
    ),
 
    /**
     * Update an existing pick face strategy
     */
    updatePickFaceStrategy: withAudit(
      {
        entity: 'PickFaceStrategy',
        action: 'UPDATE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args, context) => {
          return await pickFaceStrategiesRepository.getPickFaceStrategyById(args.id, (context as GraphQLContext).organizationId || undefined);
        },
      },
      async (_: unknown, { id, input }: { id: string; input: {
        skuId?: string;
        storageBinId?: string;
        binType?: string;
        isActive?: boolean;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        const { success: uSuccess, data: uData, error: uError } = updatePickFaceStrategySchema.safeParse(input);
        if (!uSuccess) {
          throw new GraphQLError(prettifyError(uError), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        const strategy = await pickFaceStrategiesRepository.updatePickFaceStrategy({
          skuId: uData.skuId,
          storageBinId: uData.storageBinId,
          binType: uData.binType,
          isActive: uData.isActive,
          updatedBy: uData.updatedBy,
        }, id, context.organizationId || undefined, context.tx);
        if (!strategy) return null;
        const populated = await pickFaceStrategiesRepository.getPickFaceStrategyById(strategy.id, context.organizationId || undefined);
        return populated ? transformPickFaceStrategy(populated) : transformPickFaceStrategy(strategy);
      },
    ),

    /**
     * Delete a pick face strategy
     */
    deletePickFaceStrategy: withAudit(
      {
        entity: 'PickFaceStrategy',
        action: 'DELETE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args, context) => {
          return await pickFaceStrategiesRepository.getPickFaceStrategyById(args.id, (context as GraphQLContext).organizationId || undefined);
        },
      },
      async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        return await pickFaceStrategiesRepository.deletePickFaceStrategy(id, context.organizationId || undefined, context.tx);
      },
    ),
  },
};
