/**
 * Region GraphQL Resolvers
 * 
 * @description Resolver functions for Region operations.
 * Uses RegionRepository for data access.
 */

import { regionRepository } from '@/composition-root';
import { RegionFilter } from './region.repository';
import { withAudit } from '@/features/audit-log/audit.wrapper';
import type { GraphQLContext } from '@/graphql/context';

// ============================================
// HELPER FUNCTIONS
// ============================================

function transformRegion(region: {
  regionId: string;
  regionName: string;
  regionCode: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}) {
  return {
    regionId: region.regionId,
    regionName: region.regionName,
    regionCode: region.regionCode,
    createdAt: region.createdAt.toISOString(),
    updatedAt: region.updatedAt.toISOString(),
    createdBy: region.createdBy,
    updatedBy: region.updatedBy,
  };
}

// ============================================
// RESOLVERS
// ============================================

function transformPricing(p: {
  id: string;
  regionId: string;
  rate: string;
  minQty: string;
  sstRate: string;
  isActive: boolean;
  updatedAt: Date;
}) {
  return {
    id: p.id,
    regionId: p.regionId,
    rate: p.rate,
    minQty: p.minQty,
    sstRate: p.sstRate,
    isActive: p.isActive,
    updatedAt: p.updatedAt.toISOString(),
  };
}

export const resolvers = {
  Region: {
    pricing: async (parent: { regionId: string }) => {
      const pricing = await regionRepository.getRegionPricingByRegionId(parent.regionId);
      if (!pricing) return null;
      return transformPricing(pricing);
    },
  },

  Query: {
    /**
     * Get regions with optional filtering and pagination
     */
    regions: async (_: unknown, args: {
      filter?: {
        regionId?: string;
        regionIds?: string[];
        regionCode?: string;
        regionCodes?: string[];
        regionName?: string;
      };
      pageSize?: number;
      pageNumber?: number;
    }) => {
      const filter: RegionFilter = {};
      
      if (args.filter) {
        if (args.filter.regionIds) {
          filter.regionId = args.filter.regionIds;
        } else if (args.filter.regionId) {
          filter.regionId = args.filter.regionId;
        }
        
        if (args.filter.regionCodes) {
          filter.regionCode = args.filter.regionCodes;
        } else if (args.filter.regionCode) {
          filter.regionCode = args.filter.regionCode;
        }
        
        if (args.filter.regionName) {
          filter.regionName = args.filter.regionName;
        }
      }

      const result = await regionRepository.getRegion(filter, {
        pageSize: args.pageSize,
        pageNumber: args.pageNumber,
      });

      return {
        query: result.query.map(transformRegion),
        pagination: result.pagination,
      };
    },

    /**
     * Get a single region by ID
     */
    region: async (_: unknown, { id }: { id: string }) => {
      const region = await regionRepository.getRegionById(id);
      if (!region) return null;
      return transformRegion(region);
    },
  },

  Mutation: {
    /**
     * Create a new region
     */
    createRegion: withAudit<unknown, { input: {
      regionName: string;
      regionCode: string;
      createdBy: string;
      updatedBy: string;
    }}, ReturnType<typeof transformRegion>>(
      {
        entity: 'Region',
        action: 'CREATE',
        getEntityId: (result) => (result as ReturnType<typeof transformRegion> | null)?.regionId ?? null,
      },
      async (_: unknown, { input }: { input: {
        regionName: string;
        regionCode: string;
        createdBy: string;
        updatedBy: string;
      }}, context) => {
        const region = await regionRepository.createRegion({
          regionName: input.regionName,
          regionCode: input.regionCode,
          createdBy: input.createdBy,
          updatedBy: input.updatedBy,
        }, context.tx);

        return transformRegion(region);
      }
    ),

    /**
     * Update an existing region
     */
    updateRegion: withAudit<unknown, { id: string; input: {
      regionName?: string;
      regionCode?: string;
      updatedBy: string;
    }}, ReturnType<typeof transformRegion> | null>(
      {
        entity: 'Region',
        action: 'UPDATE',
        getEntityId: (_, args) => (args as { id: string }).id,
        getOldData: async (args) => {
          return await regionRepository.getRegionById((args as { id: string }).id);
        },
      },
      async (_: unknown, { id, input }: { id: string; input: {
        regionName?: string;
        regionCode?: string;
        updatedBy: string;
      }}, context) => {
        const updateData: Record<string, unknown> = {
          updatedBy: input.updatedBy,
        };

        if (input.regionName !== undefined) updateData.regionName = input.regionName;
        if (input.regionCode !== undefined) updateData.regionCode = input.regionCode;

        const region = await regionRepository.updateRegion(updateData, id, context.tx);
        if (!region) return null;
        
        return transformRegion(region);
      }
    ),

    /**
     * Delete a region
     */
    deleteRegion: withAudit<unknown, { id: string }, boolean>(
      {
        entity: 'Region',
        action: 'DELETE',
        getEntityId: (_, args) => (args as { id: string }).id,
        getOldData: async (args) => {
          return await regionRepository.getRegionById((args as { id: string }).id);
        },
      },
      async (_: unknown, { id }: { id: string }, context) => {
        return await regionRepository.deleteRegion(id, context.tx);
      }
    ),

    /**
     * Upsert pricing for a region
     */
    upsertRegionPricing: async (
      _: unknown,
      { regionId, input }: {
        regionId: string;
        input: {
          rate: number;
          minQty?: number;
          sstRate?: number;
          isActive?: boolean;
        };
      },
      context: GraphQLContext,
    ) => {
      const updatedBy = context.user?.id ?? 'system';
      const pricing = await regionRepository.upsertRegionPricing(regionId, {
        rate: String(input.rate),
        ...(input.minQty !== undefined ? { minQty: String(input.minQty) } : {}),
        ...(input.sstRate !== undefined ? { sstRate: String(input.sstRate) } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        updatedBy,
      });
      return transformPricing(pricing);
    },
  },
};
