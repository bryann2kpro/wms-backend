/**
 * Inventory movement GraphQL resolvers.
 *
 * @description Resolvers for inventory movement queries and SKU integrity / backfill mutations.
 */

import { authRepository, inventoryMovementRepository } from '@/composition-root';
import { InventoryMovementsFilter } from './inventory.repository';
import { InventoryMovementType } from './inventory.model';
import { withAudit } from '@/features/audit-log/audit.wrapper';
import type { GraphQLContext } from '@/graphql/context';

// ============================================
// HELPER FUNCTIONS
// ============================================

function transformInventoryMovement(inventoryMovement: {
  id: string;
  skuId: string;
  regionId?: string | null;
  movementType: string;
  quantity: string | number;
  lossQty?: string | number | null;
  balanceAfter: string | number | null;
  referenceNo: string | null;
  reason: string | null;
  lotNo?: string | null;
  rackId?: string | null;
  createdAt: Date | string;
  createdBy: string;
  createdByUser?: { id: string; displayName: string } | null;
}) {
  return {
    id: inventoryMovement.id,
    skuId: inventoryMovement.skuId,
    regionId: inventoryMovement.regionId ?? null,
    movementType: inventoryMovement.movementType,
    quantity: String(inventoryMovement.quantity ?? '0'),
    lossQty: inventoryMovement.lossQty != null ? String(inventoryMovement.lossQty) : null,
    balanceAfter: String(inventoryMovement.balanceAfter ?? '0'),
    referenceNo: inventoryMovement.referenceNo,
    reason: inventoryMovement.reason,
    lotNo: inventoryMovement.lotNo ?? null,
    rackId: inventoryMovement.rackId ?? null,
    createdAt:
      inventoryMovement.createdAt instanceof Date
        ? inventoryMovement.createdAt.toISOString()
        : inventoryMovement.createdAt,
    createdBy: inventoryMovement.createdBy,
    createdByUser: inventoryMovement.createdByUser ?? null,
  };
}

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  Query: {
    /**
     * Compare GRNs, shipped DOs, and stock adjustments to inventory_movements for a SKU.
     */
    skuIntegrityCheck: async (_: unknown, { skuId }: { skuId: string }) => {
      return inventoryMovementRepository.checkSkuIntegrity(skuId);
    },

    /**
     * List inventory movements with optional filters and pagination.
     */
    inventoryMovements: async (
      _: unknown,
      args: {
        filter?: {
          id?: string;
          skuId?: string;
          skuIds?: string[];
          regionId?: string;
          regionIds?: string[];
          movementType?: InventoryMovementType;
          movementTypes?: InventoryMovementType[];
          referenceNo?: string;
          reason?: string;
          dateFrom?: string;
          dateTo?: string;
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

        if (args.filter.regionIds) {
          filter.regionId = args.filter.regionIds;
        } else if (args.filter.regionId) {
          filter.regionId = args.filter.regionId;
        }

        if (args.filter.movementTypes) {
          filter.movementType = args.filter.movementTypes;
        } else if (args.filter.movementType) {
          filter.movementType = args.filter.movementType;
        }

        if (args.filter.referenceNo) {
          filter.referenceNo = args.filter.referenceNo;
        }

        if (args.filter.reason) {
          filter.reason = args.filter.reason;
        }

        if (args.filter.dateFrom) {
          filter.dateFrom = args.filter.dateFrom;
        }

        if (args.filter.dateTo) {
          filter.dateTo = args.filter.dateTo;
        }
      }

      const result = await inventoryMovementRepository.getInventoryMovements(filter, {
        pageSize: args.pageSize,
        pageNumber: args.pageNumber,
        sortBy: args.sortBy,
        sortOrder: args.sortOrder,
      });

      // Batch-load audit users to avoid N+1
      const allUserIds = Array.from(
        new Set(result.query.flatMap((w: { createdBy?: string | null }) => [w.createdBy].filter(Boolean))),
      );

      const users = await authRepository.getUsersByIds(allUserIds as string[]);
      const userMap = new Map(users.map((u) => [u.id, u]));

      return {
        query: result.query.map((w: (typeof result.query)[number]) =>
          transformInventoryMovement({
            ...w,
            createdByUser: w.createdBy
              ? userMap.get(w.createdBy)
                ? { id: w.createdBy, displayName: userMap.get(w.createdBy)!.displayName }
                : undefined
              : undefined,
          }),
        ),
        pagination: result.pagination,
      };
    },

    /**
     * Get per-batch, per-location stock details for a SKU
     */
    skuStockDetails: async (_: unknown, { skuId }: { skuId: string }) => {
      const details = await inventoryMovementRepository.getSkuStockDetails(skuId);
      return {
        skuId,
        details: details.map((d) => ({
          lotNo: d.lotNo ?? null,
          expiryDate: d.expiryDate instanceof Date ? d.expiryDate.toISOString() : (d.expiryDate ?? null),
          rackId: d.rackId ?? null,
          rackRow: d.rackRow ?? null,
          rackColumn: d.rackColumn ?? null,
          rackLevel: d.rackLevel ?? null,
          onHandQty: d.onHandQty,
          lossQty: d.lossQty,
          reservedQty: d.reservedQty,
          firstInboundAt: d.firstInboundAt instanceof Date ? d.firstInboundAt.toISOString() : (d.firstInboundAt ?? null),
        })),
      };
    },

    /**
     * Get a single inventory movement by ID.
     */
    inventoryMovement: async (_: unknown, { id }: { id: string }) => {
      const row = await inventoryMovementRepository.getInventoryMovementById(id);
      if (!row) return null;

      const users = await authRepository.getUsersByIds([row.createdBy].filter(Boolean) as string[]);
      const userMap = new Map(users.map((u) => [u.id, u]));

      return transformInventoryMovement({
        ...row,
        createdByUser: row.createdBy
          ? userMap.get(row.createdBy)
            ? { id: row.createdBy, displayName: userMap.get(row.createdBy)!.displayName }
            : undefined
          : undefined,
      });
    },
  },

  Mutation: {
    backfillSkuMovements: withAudit(
      {
        entity: 'InventoryBalance',
        action: 'UPDATE',
        getEntityId: (result: any) => result?.skuId ?? null,
      },
      async (_: unknown, { skuId }: { skuId: string }, context: GraphQLContext) => {
        const tx = context.tx!;
        const organizationId = context.organizationId!;
        const userId = context.user?.id ?? 'system';
        return inventoryMovementRepository.backfillSkuMovements(skuId, organizationId, userId, tx);
      },
    ),

    reconcileSkuBalance: withAudit(
      {
        entity: 'InventoryBalance',
        action: 'UPDATE',
        getEntityId: (result: any) => result?.skuId ?? null,
      },
      async (_: unknown, { skuId }: { skuId: string }, context: GraphQLContext) => {
        const tx = context.tx!;
        const organizationId = context.organizationId!;
        const result = await inventoryMovementRepository.reconcileSkuBalance(skuId, organizationId, tx);
        return { skuId, ...result };
      },
    ),
  },
};