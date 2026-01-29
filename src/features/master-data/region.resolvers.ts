/**
 * Region GraphQL Resolvers
 * 
 * @description Resolver functions for Region operations.
 * Uses RegionRepository for data access.
 */

import { regionRepository } from '@/composition-root';
import { RegionFilter } from './region.repository';

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

export const resolvers = {
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
    createRegion: async (_: unknown, { input }: { input: {
      regionName: string;
      regionCode: string;
      createdBy: string;
      updatedBy: string;
    }}) => {
      const region = await regionRepository.createRegion({
        regionName: input.regionName,
        regionCode: input.regionCode,
        createdBy: input.createdBy,
        updatedBy: input.updatedBy,
      });

      return transformRegion(region);
    },

    /**
     * Update an existing region
     */
    updateRegion: async (_: unknown, { id, input }: { id: string; input: {
      regionName?: string;
      regionCode?: string;
      updatedBy: string;
    }}) => {
      const updateData: Record<string, unknown> = {
        updatedBy: input.updatedBy,
      };

      if (input.regionName !== undefined) updateData.regionName = input.regionName;
      if (input.regionCode !== undefined) updateData.regionCode = input.regionCode;

      const region = await regionRepository.updateRegion(updateData, id);
      if (!region) return null;
      
      return transformRegion(region);
    },

    /**
     * Delete a region
     */
    deleteRegion: async (_: unknown, { id }: { id: string }) => {
      return await regionRepository.deleteRegion(id);
    },
  },
};
