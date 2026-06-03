/**
 * Areas GraphQL Resolvers
 *
 * @description Resolver functions for Area operations.
 * Uses AreaRepository for data access.
 */

import { areasRepository } from '@/composition-root';
import { AreaFilter } from './area.repository';
import { withAudit } from '../audit-log/audit.wrapper';
import { GraphQLContext } from '@/graphql/context';
import { prettifyError, z } from 'zod';
import { GraphQLError } from 'graphql';

const areaFilterSchema = z.object({
  areaId: z.string().uuid().optional(),
  mapId: z.string().uuid().optional(),
  areaCode: z.string().optional(),
  areaName: z.string().optional(),
});

const createAreaSchema = z.object({
  mapId: z.string().uuid().optional(),
  areaCode: z.string().min(1, 'Area code is required'),
  areaName: z.string().min(1, 'Area name is required'),
  areaDescription: z.string().optional(),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
});

const updateAreaSchema = z.object({
  mapId: z.string().uuid().optional(),
  areaCode: z.string().min(1).optional(),
  areaName: z.string().min(1).optional(),
  areaDescription: z.string().optional(),
  updatedBy: z.string().min(1),
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function transformArea(area: {
  areaId: string;
  mapId: string | null;
  areaCode: string;
  areaName: string;
  areaDescription: string | null;
  warehouseName?: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}) {
  return {
    areaId: area.areaId,
    mapId: area.mapId,
    areaCode: area.areaCode,
    areaName: area.areaName,
    areaDescription: area.areaDescription,
    warehouseName: area.warehouseName ?? null,
    createdAt: area.createdAt.toISOString(),
    updatedAt: area.updatedAt.toISOString(),
    createdBy: area.createdBy,
    updatedBy: area.updatedBy,
  };
}

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  Query: {
    /**
     * Get areas with optional filtering and pagination
     */
    areas: async (_: unknown, args: {
      filter?: {
        areaId?: string;
        mapId?: string;
        areaCode?: string;
        areaName?: string;
      };
      pageSize?: number;
      pageNumber?: number;
    }, context: GraphQLContext) => {
      const filter: AreaFilter = {};

      if (args.filter) {
        const { success, data, error } = areaFilterSchema.safeParse(args.filter);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        if (data.areaId) filter.areaId = data.areaId;
        if (data.mapId) filter.mapId = data.mapId;
        if (data.areaCode) filter.areaCode = data.areaCode;
        if (data.areaName) filter.areaName = data.areaName;
      }

      const result = await areasRepository.getAreas(filter, {
        pageSize: args.pageSize,
        pageNumber: args.pageNumber,
      }, context.organizationId || undefined);

      return {
        query: result.query.map(transformArea),
        pagination: result.pagination,
      };
    },

    /**
     * Get a single area by ID
     */
    area: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
      const area = await areasRepository.getAreaById(id, context.organizationId || undefined);
      if (!area) return null;
      return transformArea(area);
    },
  },

  Mutation: {
    /**
     * Create a new area
     */
    createArea: withAudit(
      {
        entity: 'Area',
        action: 'CREATE',
        getEntityId: (result) => result?.areaId ?? null,
      },
      async (_: unknown, { input }: { input: {
        mapId?: string;
        areaCode: string;
        areaName: string;
        areaDescription?: string;
        createdBy: string;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        if (!context.organizationId) {
          throw new GraphQLError('Organization context is required', {
            extensions: { code: 'UNAUTHORIZED', http: { status: 401 } },
          });
        }
        const { success, data, error } = createAreaSchema.safeParse(input);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        const area = await areasRepository.createArea({
          organizationId: context.organizationId,
          mapId: data.mapId,
          areaCode: data.areaCode,
          areaName: data.areaName,
          areaDescription: data.areaDescription,
          createdBy: data.createdBy,
          updatedBy: data.updatedBy,
        }, context.organizationId, context.tx);
        return area ? transformArea(area) : null;
      },
    ),

    /**
     * Update an existing area
     */
    updateArea: withAudit(
      {
        entity: 'Area',
        action: 'UPDATE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args, context) => {
          return await areasRepository.getAreaById(args.id, (context as GraphQLContext).organizationId || undefined);
        },
      },
      async (_: unknown, { id, input }: { id: string; input: {
        mapId?: string;
        areaCode?: string;
        areaName?: string;
        areaDescription?: string;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        const { success: uSuccess, data: uData, error: uError } = updateAreaSchema.safeParse(input);
        if (!uSuccess) {
          throw new GraphQLError(prettifyError(uError), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        const area = await areasRepository.updateArea({
          mapId: uData.mapId,
          areaCode: uData.areaCode,
          areaName: uData.areaName,
          areaDescription: uData.areaDescription,
          updatedBy: uData.updatedBy,
        }, id, context.organizationId || undefined, context.tx);
        if (!area) return null;
        return transformArea(area);
      },
    ),

    /**
     * Delete an area
     */
    deleteArea: withAudit(
      {
        entity: 'Area',
        action: 'DELETE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args, context) => {
          return await areasRepository.getAreaById(args.id, (context as GraphQLContext).organizationId || undefined);
        },
      },
      async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        return await areasRepository.deleteArea(id, context.organizationId || undefined, context.tx);
      },
    ),
  },
};
