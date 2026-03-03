/**
 * Audit Log GraphQL Resolvers
 * 
 * @description Resolver functions for audit log operations.
 * Uses AuditLogRepository for data access.
 */

import { authRepository, inventoryMovementsRepository, warehousesRepository } from '@/composition-root';
import { InventoryMovementsFilter } from './inventory.repository';

// ============================================
// HELPER FUNCTIONS
// ============================================

function transformInventoryMovement(inventoryMovement: {
  id: string;
  skuId: string;
  movementType: string;
  quantity: number;
  balanceAfter: number;
  referenceNo: string;
  reason: string;
  createdAt: Date;
  createdBy: string;
}) {
  return {
    id: inventoryMovement.id,
    skuId: inventoryMovement.skuId,
    movementType: inventoryMovement.movementType,
    quantity: inventoryMovement.quantity,
    balanceAfter: inventoryMovement.balanceAfter,
    referenceNo: inventoryMovement.referenceNo,
    reason: inventoryMovement.reason,
    createdAt: inventoryMovement.createdAt instanceof Date ? inventoryMovement.createdAt.toISOString() : inventoryMovement.createdAt,
    createdBy: inventoryMovement.createdBy,
  };
}

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  Query: {
    /**
     * Get warehouses with optional filtering and pagination
     */
    inventoryMovements: async (
      _: unknown,
      args: {
        filter?: {
          id?: string;
          skuId?: string;
          skuIds?: string[];
          movementType?: string;
          movementTypes?: string[];
          referenceNo?: string;
          reason?: string;
        };
        pageSize?: number;
        pageNumber?: number;
        sortBy?: string;
        sortOrder?: string;
      }
    ) => {
      const filter: InventoryMovementsFilter = {};

      if (args.filter) {
        if (args.filter.skuIds) {
          filter.skuId = args.filter.skuIds;
        } else if (args.filter.skuId) {
          filter.skuId = args.filter.skuId;
        }

        if (args.filter.movementType) {
          filter.movementType = args.filter.movementType;
        } 

        if (args.filter.referenceNo) {
          filter.referenceNo = args.filter.referenceNo;
        }

        if (args.filter.reason) {
          filter.reason = args.filter.reason;
        }
      }

      const result = await inventoryMovementsRepository.getInventoryMovements(filter, {
        pageSize: args.pageSize,
        pageNumber: args.pageNumber,
        sortBy: args.sortBy,
        sortOrder: args.sortOrder,
      });

      // Batch-load audit users to avoid N+1
      const allUserIds = Array.from(
        new Set(
          result.query.flatMap((w: any) => [w.createdBy, w.updatedBy].filter(Boolean))
        )
      );

      const users = await authRepository.getUsersByIds(allUserIds as string[]);
      const userMap = new Map(users.map((u) => [u.id, u]));

      return {
        query: result.query.map((w: any) =>
          transformInventoryMovement({
            ...w,
            createdByUser: w.createdBy
              ? userMap.get(w.createdBy)
                ? { id: w.createdBy, displayName: userMap.get(w.createdBy)!.displayName }
                : undefined
              : undefined,
            updatedByUser: w.updatedBy
              ? userMap.get(w.updatedBy)
                ? { id: w.updatedBy, displayName: userMap.get(w.updatedBy)!.displayName }
                : undefined
              : undefined,
          })
        ),
        pagination: result.pagination,
      };
    },

    /**
     * Get a single warehouse by ID
     */
    inventoryMovement: async (_: unknown, { id }: { id: string }) => {
      const warehouse = await warehousesRepository.getWarehouseById(id);
      if (!warehouse) return null;

      // For single warehouse, N+1 isn't an issue, but we can still batch-style load
      const users = await authRepository.getUsersByIds(
        [warehouse.createdBy, warehouse.updatedBy].filter(Boolean) as string[]
      );
      const userMap = new Map(users.map((u) => [u.id, u]));

      return transformInventoryMovement({
        ...(warehouse as any),
        createdByUser: warehouse.createdBy
          ? userMap.get(warehouse.createdBy)
            ? { id: warehouse.createdBy, displayName: userMap.get(warehouse.createdBy)!.displayName }
            : undefined
          : undefined,
        updatedByUser: warehouse.updatedBy
          ? userMap.get(warehouse.updatedBy)
            ? { id: warehouse.updatedBy, displayName: userMap.get(warehouse.updatedBy)!.displayName }
            : undefined
          : undefined,
      });
    },
  },
};