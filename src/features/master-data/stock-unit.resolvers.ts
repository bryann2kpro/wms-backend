/**
 * Stock Unit GraphQL Resolvers
 * 
 * @description Resolver functions for Stock Unit (UOM) operations.
 * Uses StockUnitRepository for data access.
 */

import { stockUnitRepository } from '@/composition-root';
import { StockUnitFilter } from './stock-unit.repository';
import { withAudit } from '@/features/audit-log/audit.wrapper';
import { GraphQLContext } from '@/graphql/context';

// ============================================
// HELPER FUNCTIONS
// ============================================

function transformStockUnit(stockUnit: {
  stockUnitId: string;
  unitName: string;
  unitCode: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}) {
  return {
    stockUnitId: stockUnit.stockUnitId,
    unitName: stockUnit.unitName,
    unitCode: stockUnit.unitCode,
    isActive: stockUnit.isActive,
    createdAt: stockUnit.createdAt.toISOString(),
    updatedAt: stockUnit.updatedAt.toISOString(),
    createdBy: stockUnit.createdBy,
    updatedBy: stockUnit.updatedBy,
  };
}

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  Query: {
    /**
     * Get stock units with optional filtering and pagination
     */
    stockUnits: async (_: unknown, args: {
      filter?: {
        stockUnitId?: string;
        stockUnitIds?: string[];
        unitCode?: string;
        unitCodes?: string[];
        unitName?: string;
        isActive?: boolean;
      };
      pageSize?: number;
      pageNumber?: number;
    }) => {
      const filter: StockUnitFilter = {};
      
      if (args.filter) {
        if (args.filter.stockUnitIds) {
          filter.stockUnitId = args.filter.stockUnitIds;
        } else if (args.filter.stockUnitId) {
          filter.stockUnitId = args.filter.stockUnitId;
        }
        
        if (args.filter.unitCodes) {
          filter.unitCode = args.filter.unitCodes;
        } else if (args.filter.unitCode) {
          filter.unitCode = args.filter.unitCode;
        }
        
        if (args.filter.unitName) {
          filter.unitName = args.filter.unitName;
        }
        
        if (args.filter.isActive !== undefined) {
          filter.isActive = args.filter.isActive;
        }
      }

      const result = await stockUnitRepository.getStockUnit(filter, {
        pageSize: args.pageSize,
        pageNumber: args.pageNumber,
      });

      return {
        query: result.query.map(transformStockUnit),
        pagination: result.pagination,
      };
    },

    /**
     * Get a single stock unit by ID
     */
    stockUnit: async (_: unknown, { id }: { id: string }) => {
      const stockUnit = await stockUnitRepository.getStockUnitById(id);
      if (!stockUnit) return null;
      return transformStockUnit(stockUnit);
    },
  },

  Mutation: {
    /**
     * Create a new stock unit
     */
    createStockUnit: withAudit(
      {
        entity: 'StockUnit',
        action: 'CREATE',
        getEntityId: (result) => result?.stockUnitId ?? null,
      },
      async (_: unknown, { input }: { input: {
        unitName: string;
        unitCode: string;
        isActive?: boolean;
        createdBy: string;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        const stockUnit = await stockUnitRepository.createStockUnit({
          unitName: input.unitName,
          unitCode: input.unitCode,
          isActive: input.isActive ?? true,
          createdBy: input.createdBy,
          updatedBy: input.updatedBy,
        }, context.tx);

        return transformStockUnit(stockUnit);
      }
    ),

    /**
     * Update an existing stock unit
     */
    updateStockUnit: withAudit(
      {
        entity: 'StockUnit',
        action: 'UPDATE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args) => {
          return await stockUnitRepository.getStockUnitById(args.id);
        },
      },
      async (_: unknown, { id, input }: { id: string; input: {
        unitName?: string;
        unitCode?: string;
        isActive?: boolean;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        const updateData: Record<string, unknown> = {
          updatedBy: input.updatedBy,
        };

        if (input.unitName !== undefined) updateData.unitName = input.unitName;
        if (input.unitCode !== undefined) updateData.unitCode = input.unitCode;
        if (input.isActive !== undefined) updateData.isActive = input.isActive;

        const stockUnit = await stockUnitRepository.updateStockUnit(updateData, id, context.tx);
        if (!stockUnit) return null;
        
        return transformStockUnit(stockUnit);
      }
    ),

    /**
     * Toggle stock unit active status
     */
    toggleStockUnitActive: withAudit(
      {
        entity: 'StockUnit',
        action: 'UPDATE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args) => {
          return await stockUnitRepository.getStockUnitById(args.id);
        },
      },
      async (_: unknown, { id, isActive, updatedBy }: { 
        id: string; 
        isActive: boolean; 
        updatedBy: string; 
      }, context: GraphQLContext) => {
        const stockUnit = await stockUnitRepository.toggleStockUnitActive(id, isActive, updatedBy, context.tx);
        if (!stockUnit) return null;
        
        return transformStockUnit(stockUnit);
      }
    ),

    /**
     * Delete a stock unit
     */
    deleteStockUnit: withAudit(
      {
        entity: 'StockUnit',
        action: 'DELETE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args) => {
          return await stockUnitRepository.getStockUnitById(args.id);
        },
      },
      async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        return await stockUnitRepository.deleteStockUnit(id, context.tx);
      }
    ),
  },
};
