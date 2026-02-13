/**
 * Racks GraphQL Resolvers
 * 
 * @description Resolver functions for Rack operations.
 * Uses RacksRepository for data access.
 */

import { racksRepository } from '@/composition-root';
import { RackFilter } from './racks.repository';
import { withAudit } from '../audit-log/audit.wrapper';

// ============================================ 
// HELPER FUNCTIONS
// ============================================

function transformRack(rack: {
  rackId: string;
  rackRow: string;
  rackColumn: string;
  rackLevel: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}) {
  return {
    rackId: rack.rackId,
    rackRow: rack.rackRow,
    rackColumn: rack.rackColumn,
    rackLevel: rack.rackLevel,
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
      pageSize?: number;
      pageNumber?: number;
    }) => {
      const filter: RackFilter = {};
      
      if (args.filter) {
        if (args.filter.rackIds) {
          filter.rackId = args.filter.rackIds;
        } else if (args.filter.rackId) {
          filter.rackId = args.filter.rackId;
        }
        
        if (args.filter.rackRows) {
          filter.rackRow = args.filter.rackRows;
        } else if (args.filter.rackRow) {
          filter.rackRow = args.filter.rackRow;
        }
        
        if (args.filter.rackColumns) {
          filter.rackColumn = args.filter.rackColumns;
        } else if (args.filter.rackColumn) {
          filter.rackColumn = args.filter.rackColumn;
        }
        
        if (args.filter.rackLevels) {
          filter.rackLevel = args.filter.rackLevels;
        } else if (args.filter.rackLevel) {
          filter.rackLevel = args.filter.rackLevel;
        }
      }

      const result = await racksRepository.getRack(filter, {
        pageSize: args.pageSize,
        pageNumber: args.pageNumber,
      });

      return {
        query: result.query.map(transformRack),
        pagination: result.pagination,
      };
    },

    /**
     * Get a single outlet by ID
     */
    rack: async (_: unknown, { id }: { id: string }) => {
      const rack = await racksRepository.getRackById(id);
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
      }}) => {
        const rack = await racksRepository.createRack({
          rackRow: input.rackRow,
          rackColumn: input.rackColumn,
          rackLevel: input.rackLevel,
          createdBy: input.createdBy,
          updatedBy: input.updatedBy,
        });
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
        getOldData: async (args) => {
          return await racksRepository.getRackById(args.id);
        },
      },
      async (_: unknown, { id, input }: { id: string; input: {
        rackRow?: string;
        rackColumn?: string;
        rackLevel?: string;
        updatedBy: string;
      }}) => {
        const rack = await racksRepository.updateRack({
          rackRow: input.rackRow || undefined,
          rackColumn: input.rackColumn || undefined,
          rackLevel: input.rackLevel || undefined,
          updatedBy: input.updatedBy,
        }, id);
        if (!rack) return null;
        return transformRack(rack);
      },
    ),
    /**
     * Delete an rack
     */
    deleteRack: withAudit(
      {
        entity: 'Rack',
        action: 'DELETE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args) => {
          return await racksRepository.getRackById(args.id);
        },
      },
      async (_: unknown, { id }: { id: string }) => {
      return await racksRepository.deleteRack(id);
      },
    ),
  },
};
