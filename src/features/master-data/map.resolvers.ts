/**
 * Map GraphQL Resolvers
 *
 * @description Resolver functions for Map operations.
 * Uses MapRepository for data access.
 */

import { mapsRepository } from '@/composition-root';
import { MapFilter } from './map.repository';
import { withAudit } from '../audit-log/audit.wrapper';
import { GraphQLContext } from '@/graphql/context';
import { prettifyError, z } from 'zod';
import { GraphQLError } from 'graphql';

const mapFilterSchema = z.object({
  mapId: z.string().uuid().optional(),
  mapCode: z.string().optional(),
  mapName: z.string().optional(),
});

const createMapSchema = z.object({
  mapCode: z.string().min(1, 'Map code is required'),
  mapName: z.string().min(1, 'Map name is required'),
  mapDescription: z.string().optional(),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
});

const updateMapSchema = z.object({
  mapCode: z.string().min(1).optional(),
  mapName: z.string().min(1).optional(),
  mapDescription: z.string().optional(),
  updatedBy: z.string().min(1),
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function transformMap(map: {
  mapId: string;
  mapCode: string;
  mapName: string;
  mapDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}) {
  return {
    mapId: map.mapId,
    mapCode: map.mapCode,
    mapName: map.mapName,
    mapDescription: map.mapDescription,
    createdAt: map.createdAt.toISOString(),
    updatedAt: map.updatedAt.toISOString(),
    createdBy: map.createdBy,
    updatedBy: map.updatedBy,
  };
}

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  Query: {
    /**
     * Get maps with optional filtering and pagination
     */
    maps: async (_: unknown, args: {
      filter?: {
        mapId?: string;
        mapCode?: string;
        mapName?: string;
      };
      pageSize?: number;
      pageNumber?: number;
    }, context: GraphQLContext) => {
      const filter: MapFilter = {};

      if (args.filter) {
        const { success, data, error } = mapFilterSchema.safeParse(args.filter);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        if (data.mapId) filter.mapId = data.mapId;
        if (data.mapCode) filter.mapCode = data.mapCode;
        if (data.mapName) filter.mapName = data.mapName;
      }

      const result = await mapsRepository.getMaps(filter, {
        pageSize: args.pageSize,
        pageNumber: args.pageNumber,
      }, context.organizationId || undefined);

      return {
        query: result.query.map(transformMap),
        pagination: result.pagination,
      };
    },

    /**
     * Get a single map by ID
     */
    map: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
      const map = await mapsRepository.getMapById(id, context.organizationId || undefined);
      if (!map) return null;
      return transformMap(map);
    },
  },

  Mutation: {
    /**
     * Create a new map
     */
    createMap: withAudit(
      {
        entity: 'Map',
        action: 'CREATE',
        getEntityId: (result) => result?.mapId ?? null,
      },
      async (_: unknown, { input }: { input: {
        mapCode: string;
        mapName: string;
        mapDescription?: string;
        createdBy: string;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        if (!context.organizationId) {
          throw new GraphQLError('Organization context is required', {
            extensions: { code: 'UNAUTHORIZED', http: { status: 401 } },
          });
        }
        const { success, data, error } = createMapSchema.safeParse(input);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        const map = await mapsRepository.createMap({
          organizationId: context.organizationId,
          mapCode: data.mapCode,
          mapName: data.mapName,
          mapDescription: data.mapDescription,
          createdBy: data.createdBy,
          updatedBy: data.updatedBy,
        }, context.organizationId, context.tx);
        return map ? transformMap(map) : null;
      },
    ),

    /**
     * Update an existing map
     */
    updateMap: withAudit(
      {
        entity: 'Map',
        action: 'UPDATE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args, context) => {
          return await mapsRepository.getMapById(args.id, (context as GraphQLContext).organizationId || undefined);
        },
      },
      async (_: unknown, { id, input }: { id: string; input: {
        mapCode?: string;
        mapName?: string;
        mapDescription?: string;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        const { success: uSuccess, data: uData, error: uError } = updateMapSchema.safeParse(input);
        if (!uSuccess) {
          throw new GraphQLError(prettifyError(uError), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        const map = await mapsRepository.updateMap({
          mapCode: uData.mapCode,
          mapName: uData.mapName,
          mapDescription: uData.mapDescription,
          updatedBy: uData.updatedBy,
        }, id, context.organizationId || undefined, context.tx);
        if (!map) return null;
        return transformMap(map);
      },
    ),

    /**
     * Delete a map
     */
    deleteMap: withAudit(
      {
        entity: 'Map',
        action: 'DELETE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args, context) => {
          return await mapsRepository.getMapById(args.id, (context as GraphQLContext).organizationId || undefined);
        },
      },
      async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        return await mapsRepository.deleteMap(id, context.organizationId || undefined, context.tx);
      },
    ),
  },
};
