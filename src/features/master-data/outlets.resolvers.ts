/**
 * Outlets GraphQL Resolvers
 * 
 * @description Resolver functions for Outlet operations.
 * Uses OutletsRepository for data access.
 */

import { outletsRepository } from '@/composition-root';
import { OutletFilter } from './outlets.repository';

// ============================================
// HELPER FUNCTIONS
// ============================================

function transformOutlet(outlet: {
  outletId: string;
  outletName: string;
  outletCode: string;
  regionId: string | null;
  regionName: string | null;
  regionCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}) {
  return {
    outletId: outlet.outletId,
    outletName: outlet.outletName,
    outletCode: outlet.outletCode,
    regionId: outlet.regionId,
    regionName: outlet.regionName,
    regionCode: outlet.regionCode,
    createdAt: outlet.createdAt.toISOString(),
    updatedAt: outlet.updatedAt.toISOString(),
    createdBy: outlet.createdBy,
    updatedBy: outlet.updatedBy,
  };
}

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  Query: {
    /**
     * Get outlets with optional filtering and pagination
     */
    outlets: async (_: unknown, args: {
      filter?: {
        outletId?: string;
        outletIds?: string[];
        outletCode?: string;
        outletCodes?: string[];
        outletName?: string;
        regionId?: string;
        regionIds?: string[];
        unassignedOnly?: boolean;
      };
      pageSize?: number;
      pageNumber?: number;
    }) => {
      const filter: OutletFilter = {};
      
      if (args.filter) {
        if (args.filter.outletIds) {
          filter.outletId = args.filter.outletIds;
        } else if (args.filter.outletId) {
          filter.outletId = args.filter.outletId;
        }
        
        if (args.filter.outletCodes) {
          filter.outletCode = args.filter.outletCodes;
        } else if (args.filter.outletCode) {
          filter.outletCode = args.filter.outletCode;
        }
        
        if (args.filter.outletName) {
          filter.outletName = args.filter.outletName;
        }
        
        // Handle region filtering
        if (args.filter.unassignedOnly) {
          filter.regionId = null; // Get unassigned outlets
        } else if (args.filter.regionIds) {
          filter.regionId = args.filter.regionIds;
        } else if (args.filter.regionId) {
          filter.regionId = args.filter.regionId;
        }
      }

      const result = await outletsRepository.getOutlet(filter, {
        pageSize: args.pageSize,
        pageNumber: args.pageNumber,
      });

      return {
        query: result.query.map(transformOutlet),
        pagination: result.pagination,
      };
    },

    /**
     * Get a single outlet by ID
     */
    outlet: async (_: unknown, { id }: { id: string }) => {
      const outlet = await outletsRepository.getOutletById(id);
      if (!outlet) return null;
      return transformOutlet(outlet);
    },
  },

  Mutation: {
    /**
     * Create a new outlet
     */
    createOutlet: async (_: unknown, { input }: { input: {
      outletName: string;
      outletCode: string;
      outletAddress?: string;
      regionId?: string;
      createdBy: string;
      updatedBy: string;
    }}) => {
      const outlet = await outletsRepository.createOutlet({
        outletName: input.outletName,
        outletCode: input.outletCode,
        outletAddress: input.outletAddress ?? '',
        regionId: input.regionId || null,
        createdBy: input.createdBy,
        updatedBy: input.updatedBy,
      });

      // Fetch the full outlet with region info
      const fullOutlet = await outletsRepository.getOutletById(outlet.outletId);
      return fullOutlet ? transformOutlet(fullOutlet) : null;
    },

    /**
     * Update an existing outlet
     */
    updateOutlet: async (_: unknown, { id, input }: { id: string; input: {
      outletName?: string;
      outletCode?: string;
      regionId?: string;
      updatedBy: string;
    }}) => {
      const updateData: Record<string, unknown> = {
        updatedBy: input.updatedBy,
      };

      if (input.outletName !== undefined) updateData.outletName = input.outletName;
      if (input.outletCode !== undefined) updateData.outletCode = input.outletCode;
      if (input.regionId !== undefined) updateData.regionId = input.regionId || null;

      await outletsRepository.updateOutlet(updateData, id);
      
      // Fetch the full outlet with region info
      const fullOutlet = await outletsRepository.getOutletById(id);
      return fullOutlet ? transformOutlet(fullOutlet) : null;
    },

    /**
     * Assign an outlet to a region
     */
    assignOutletToRegion: async (_: unknown, { outletId, regionId, updatedBy }: { 
      outletId: string; 
      regionId?: string; 
      updatedBy: string; 
    }) => {
      await outletsRepository.assignOutletToRegion(outletId, regionId || null, updatedBy);
      
      // Fetch the full outlet with region info
      const fullOutlet = await outletsRepository.getOutletById(outletId);
      return fullOutlet ? transformOutlet(fullOutlet) : null;
    },

    /**
     * Bulk assign outlets to a region
     */
    bulkAssignOutletsToRegion: async (_: unknown, { outletIds, regionId, updatedBy }: { 
      outletIds: string[]; 
      regionId?: string; 
      updatedBy: string; 
    }) => {
      await outletsRepository.bulkAssignOutletsToRegion(outletIds, regionId || null, updatedBy);
      
      // Fetch all updated outlets with region info
      const result = await outletsRepository.getOutlet({ outletId: outletIds }, {});
      return result.query.map(transformOutlet);
    },

    /**
     * Delete an outlet
     */
    deleteOutlet: async (_: unknown, { id }: { id: string }) => {
      return await outletsRepository.deleteOutlet(id);
    },
  },
};
