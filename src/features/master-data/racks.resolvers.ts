/**
 * Racks GraphQL Resolvers
 *
 * @description Resolver functions for Rack operations.
 * Uses RacksRepository for data access.
 */

import { racksRepository } from '@/composition-root';
import { RackFilter } from './racks.repository';
import { withAudit } from '../audit-log/audit.wrapper';
import { GraphQLContext } from '@/graphql/context';
import { z } from 'zod';
import { GraphQLError } from 'graphql';

const rackFilterSchema = z.object({
  rackId: z.string().uuid().optional(),
  rackIds: z.array(z.string().uuid()).optional(),
  rackRow: z.string().optional(),
  rackRows: z.array(z.string()).optional(),
  rackColumn: z.string().optional(),
  rackColumns: z.array(z.string()).optional(),
  rackLevel: z.string().optional(),
  rackLevels: z.array(z.string()).optional(),
  binCode: z.string().optional(),
  binType: z.string().optional(),
  isActive: z.boolean().optional(),
}).transform((data) => ({
  ...data,
  rackIds: data.rackId ? [data.rackId] : data.rackIds,
  rackRows: data.rackRow ? [data.rackRow] : data.rackRows,
  rackColumns: data.rackColumn ? [data.rackColumn] : data.rackColumns,
  rackLevels: data.rackLevel ? [data.rackLevel] : data.rackLevels,
}));

const createRackSchema = z.object({
  zoneId: z.string().uuid().optional().nullable(),
  areaId: z.string().uuid().optional().nullable(),
  rackRow: z.string().min(1, 'Rack row is required'),
  rackColumn: z.string().min(1, 'Rack column is required'),
  rackLevel: z.string().min(1, 'Rack level is required'),
  binCode: z.string().optional().nullable(),
  barCode: z.string().optional().nullable(),
  binType: z.string().optional(),
  isActive: z.boolean().optional(),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
});

const updateRackSchema = z.object({
  zoneId: z.string().uuid().optional().nullable(),
  areaId: z.string().uuid().optional().nullable(),
  rackRow: z.string().min(1).optional(),
  rackColumn: z.string().min(1).optional(),
  rackLevel: z.string().min(1).optional(),
  binCode: z.string().optional().nullable(),
  barCode: z.string().optional().nullable(),
  binType: z.string().optional(),
  isActive: z.boolean().optional(),
  updatedBy: z.string().min(1),
});

// ============================================ 
// HELPER FUNCTIONS
// ============================================

function transformRack(rack: {
  rackId: string;
  zoneId?: string | null;
  areaId?: string | null;
  rackRow: string;
  rackColumn: string;
  rackLevel: string;
  binCode?: string | null;
  barCode?: string | null;
  binType: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}) {
  return {
    rackId: rack.rackId,
    zoneId: rack.zoneId ?? null,
    areaId: rack.areaId ?? null,
    rackRow: rack.rackRow,
    rackColumn: rack.rackColumn,
    rackLevel: rack.rackLevel,
    binCode: rack.binCode ?? null,
    barCode: rack.barCode ?? null,
    binType: rack.binType,
    isActive: rack.isActive,
    createdAt: rack.createdAt.toISOString(),
    updatedAt: rack.updatedAt.toISOString(),
    createdBy: rack.createdBy,
    updatedBy: rack.updatedBy,
  };
}

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  Query: {
    /**
     * Get racks with optional filtering and pagination
     */
    racks: async (_: unknown, args: {
      filter?: {
        rackId?: string;
        rackIds?: string[];
        rackRow?: string;
        rackRows?: string[];
        rackColumn?: string;
        rackColumns?: string[];
        rackLevel?: string;
        rackLevels?: string[];
      };
      sort?: {
        sortBy?: string;
        sortOrder?: string;
      };
      pageSize?: number;
      pageNumber?: number;
    }, context: GraphQLContext) => {
      const filter: RackFilter = {};

      if (args.filter) {
        const { success, data, error } = rackFilterSchema.safeParse(args.filter);
        if (!success) {
          throw new GraphQLError('Validation failed', { extensions: { code: 'BAD_USER_INPUT', errors: error.flatten().fieldErrors } });
        }
        if (data.rackIds) filter.rackId = data.rackIds;
        if (data.rackRows) filter.rackRow = data.rackRows;
        if (data.rackColumns) filter.rackColumn = data.rackColumns;
        if (data.rackLevels) filter.rackLevel = data.rackLevels;
        if (data.binCode) filter.binCode = data.binCode;
        if (data.binType) filter.binType = data.binType;
        if (data.isActive !== undefined) filter.isActive = data.isActive;
      }

      if (args.sort) {
        if (args.sort.sortBy) filter.sortBy = args.sort.sortBy;
        if (args.sort.sortOrder) filter.sortOrder = args.sort.sortOrder;
      }

      const result = await racksRepository.getRack(filter, {
        pageSize: args.pageSize,
        pageNumber: args.pageNumber,
      }, context.organizationId || undefined);

      return {
        query: result.query.map(transformRack),
        pagination: result.pagination,
      };
    },

    /**
     * Get a single rack by ID
     */
    rack: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
      const rack = await racksRepository.getRackById(id, context.organizationId || undefined);
      if (!rack) return null;
      return transformRack(rack);
    },
  },

  Mutation: {
    /**
     * Create a new rack
     */
    createRack: withAudit(
      {
        entity: 'Rack',
        action: 'CREATE',
        getEntityId: (result) => result?.rackId ?? null,
      },
      async (_: unknown, { input }: { input: {
        rackRow: string;
        rackColumn: string;
        rackLevel: string;
        createdBy: string;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        if (!context.organizationId) {
          throw new GraphQLError('Organization context is required', {
            extensions: { code: 'UNAUTHORIZED', http: { status: 401 } },
          });
        }
        const { success, data, error } = createRackSchema.safeParse(input);
        if (!success) {
          throw new GraphQLError('Validation failed', { extensions: { code: 'BAD_USER_INPUT', errors: error.flatten().fieldErrors } });
        }
        const rack = await racksRepository.createRack({
          organizationId: context.organizationId,
          zoneId: data.zoneId ?? undefined,
          areaId: data.areaId ?? undefined,
          rackRow: data.rackRow,
          rackColumn: data.rackColumn,
          rackLevel: data.rackLevel,
          binCode: data.binCode ?? undefined,
          barCode: data.barCode ?? undefined,
          binType: data.binType ?? 'FIXED',
          isActive: data.isActive ?? true,
          createdBy: data.createdBy,
          updatedBy: data.updatedBy,
        }, context.organizationId, context.tx);
        return rack ? transformRack(rack) : null;
      },
    ),

    /**
     * Update an existing rack
     */
    updateRack: withAudit(
      {
        entity: 'Rack',
        action: 'UPDATE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args, context) => {
          return await racksRepository.getRackById(args.id, (context as GraphQLContext).organizationId || undefined);
        },
      },
      async (_: unknown, { id, input }: { id: string; input: {
        rackRow?: string;
        rackColumn?: string;
        rackLevel?: string;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        const { success: uSuccess, data: uData, error: uError } = updateRackSchema.safeParse(input);
        if (!uSuccess) {
          throw new GraphQLError('Validation failed', { extensions: { code: 'BAD_USER_INPUT', errors: uError.flatten().fieldErrors } });
        }
        const rack = await racksRepository.updateRack({
          zoneId: uData.zoneId ?? undefined,
          areaId: uData.areaId ?? undefined,
          rackRow: uData.rackRow,
          rackColumn: uData.rackColumn,
          rackLevel: uData.rackLevel,
          binCode: uData.binCode ?? undefined,
          barCode: uData.barCode ?? undefined,
          binType: uData.binType,
          isActive: uData.isActive,
          updatedBy: uData.updatedBy,
        }, id, context.organizationId || undefined, context.tx);
        if (!rack) return null;
        return transformRack(rack);
      },
    ),
    /**
     * Delete a rack
     */
    deleteRack: withAudit(
      {
        entity: 'Rack',
        action: 'DELETE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args, context) => {
          return await racksRepository.getRackById(args.id, (context as GraphQLContext).organizationId || undefined);
        },
      },
      async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        return await racksRepository.deleteRack(id, context.organizationId || undefined, context.tx);
      },
    ),
  },
};
