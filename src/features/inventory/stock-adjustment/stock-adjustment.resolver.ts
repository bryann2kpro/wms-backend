/**
 * Stock Adjustment GraphQL Resolvers
 *
 * @description Resolver functions for Stock Adjustment operations.
 * Type definitions are in stock-adjustment.typeDefs.ts
 */

import {
  stockAdjustmentRepository,
  inventoryMovementRepository,
  skuRepository,
  authRepository,
  racksRepository,
} from '@/composition-root';
import { withAudit } from '@/features/audit-log/audit.wrapper';
import { GraphQLContext } from '@/graphql/context';
import { GraphQLError } from 'graphql';
import { logger } from '@/util/logger';
import { InventoryMovementType } from '@/features/inventory/inventory-movement/inventory.model';
import type { StockAdjustmentType } from './stock-adjustment.model';
import type { StockAdjustmentFilter } from './stock-adjustment.repository';
import type { RackType } from '@/features/master-data/racks.model';

// ============================================
// HELPER FUNCTIONS
// ============================================

function rackToGraphql(rack: RackType) {
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

function transformStockAdjustment(adj: StockAdjustmentType) {
  return {
    id: adj.id,
    organizationId: adj.organizationId,
    adjustmentNo: adj.adjustmentNo,
    reason: adj.reason ?? null,
    notes: adj.notes ?? null,
    createdAt: adj.createdAt,
    updatedAt: adj.updatedAt,
    createdBy: adj.createdBy,
    updatedBy: adj.updatedBy,
  };
}

const VALID_MOVEMENT_TYPES = ['ADJUSTMENT', 'DAMAGED'] as const;

function parseOptionalExpiryDate(value: string | null | undefined): Date | null {
  if (value == null || !String(value).trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new GraphQLError(`Invalid expiryDate: ${value}`);
  }
  return d;
}

function lineDedupKey(item: {
  skuId: string;
  rackId: string;
  lotNo?: string | null;
  expiryDate?: string | null;
}) {
  const lot = (item.lotNo ?? '').trim();
  const exp = (item.expiryDate ?? '').trim();
  return `${item.skuId}|${item.rackId.trim()}|${lot}|${exp}`;
}

export const resolvers = {
  Query: {
    stockAdjustments: async (
      _: unknown,
      args: {
        filter?: StockAdjustmentFilter;
        pageSize?: number;
        pageNumber?: number;
      },
      context: GraphQLContext,
    ) => {
      try {
        const organizationId = context.organizationId;
        const filter: StockAdjustmentFilter = args.filter || {};

        const pageSize = args.pageSize;
        const pageNumber = args.pageNumber;
        const paginationParams =
          pageSize != null && pageNumber != null
            ? { pageSize, pageNumber }
            : undefined;

        const result = await stockAdjustmentRepository.getStockAdjustments(
          filter,
          paginationParams,
          organizationId ?? undefined,
        );

        if (result === false) return false;

        return {
          query: result.query.map(transformStockAdjustment),
          pagination: result.pagination,
        };
      } catch (error) {
        logger.error('[stock-adjustment.resolver] stockAdjustments Error:', error);
        return false;
      }
    },
  },

  StockAdjustment: {
    createdByUser: async (parent: { createdBy?: string | null }) => {
      if (!parent.createdBy) return null;
      const user = await authRepository.getUserById(parent.createdBy);
      return user ? { id: user.id, displayName: user.displayName } : null;
    },

    items: async (parent: { id: string; organizationId?: string }) => {
      const items = await stockAdjustmentRepository.getStockAdjustmentItems(parent.id);

      const skuIds = [...new Set(items.map((item) => item.skuId))];
      let skuMap = new Map<string, { skuCode: string | null; skuDescription: string | null }>();
      if (skuIds.length > 0) {
        const skuResult = await skuRepository.getSku({ skuId: skuIds });
        for (const s of skuResult.query) {
          skuMap.set(s.skuId, { skuCode: s.skuCode ?? null, skuDescription: s.skuDescription ?? null });
        }
      }

      const rackIds = [...new Set(items.map((i) => i.rackId).filter((id): id is string => !!id))];
      const rackMap = new Map<string, ReturnType<typeof rackToGraphql>>();
      if (rackIds.length > 0 && parent.organizationId) {
        const rackResult = await racksRepository.getRack(
          { rackId: rackIds },
          { pageSize: 500, pageNumber: 1 },
          parent.organizationId,
        );
        for (const r of rackResult.query) {
          rackMap.set(r.rackId, rackToGraphql(r));
        }
      }

      return items.map((item) => {
        const sku = skuMap.get(item.skuId);
        const rack = item.rackId ? rackMap.get(item.rackId) ?? null : null;
        return {
          id: item.id,
          stockAdjustmentId: item.stockAdjustmentId,
          skuId: item.skuId,
          skuCode: sku?.skuCode ?? null,
          skuDescription: sku?.skuDescription ?? null,
          rackId: item.rackId ?? null,
          rack,
          lotNo: item.lotNo ?? null,
          expiryDate: item.expiryDate ? item.expiryDate.toISOString() : null,
          movementType: item.movementType,
          quantity: item.quantity,
          remarks: item.remarks ?? null,
          createdAt: item.createdAt,
        };
      });
    },
  },

  Mutation: {
    createStockAdjustment: withAudit(
      {
        entity: 'StockAdjustment',
        action: 'CREATE',
        getEntityId: (result) => (result as any)?.id ?? null,
      },
      async (
        _: unknown,
        { input }: {
          input: {
            reason?: string | null;
            notes?: string | null;
            items: Array<{
              skuId: string;
              rackId: string;
              lotNo?: string | null;
              expiryDate?: string | null;
              movementType: string;
              quantity: string;
              remarks?: string | null;
            }>;
          };
        },
        context: GraphQLContext,
      ) => {
        const tx = context.tx!;
        const userId = context.user?.id;
        const organizationId = context.organizationId;

        if (!userId) {
          throw new GraphQLError('Authentication required');
        }
        if (!organizationId) {
          throw new GraphQLError('Organization context required');
        }

        // Validate items
        if (!input.items?.length) {
          throw new GraphQLError('At least one adjustment item is required');
        }

        const rackIdsForValidation = input.items.map((i) => i.rackId?.trim()).filter(Boolean) as string[];
        if (rackIdsForValidation.length !== input.items.length) {
          throw new GraphQLError('Each line item must include a rack');
        }
        const uniqueRackIds = [...new Set(rackIdsForValidation)];
        const racksLookup = await racksRepository.getRack(
          { rackId: uniqueRackIds },
          { pageSize: 500, pageNumber: 1 },
          organizationId,
        );
        const validRackIdSet = new Set(racksLookup.query.map((r) => r.rackId));
        const missingRack = uniqueRackIds.find((id) => !validRackIdSet.has(id));
        if (missingRack) {
          throw new GraphQLError(`Rack not found or not in your organization: ${missingRack}`);
        }

        const seenLineKeys = new Set<string>();
        for (const item of input.items) {
          const dedup = lineDedupKey({
            skuId: item.skuId,
            rackId: item.rackId ?? '',
            lotNo: item.lotNo,
            expiryDate: item.expiryDate,
          });
          if (seenLineKeys.has(dedup)) {
            throw new GraphQLError(
              'Duplicate line: same SKU, rack, lot number, and expiry. Combine quantities or change lot/expiry.',
            );
          }
          seenLineKeys.add(dedup);
        }

        const parsedExpiries: (Date | null)[] = [];
        for (const item of input.items) {
          parsedExpiries.push(parseOptionalExpiryDate(item.expiryDate));
        }

        for (const item of input.items) {
          if (!VALID_MOVEMENT_TYPES.includes(item.movementType as any)) {
            throw new GraphQLError(
              `Invalid movementType: ${item.movementType}. Must be ADJUSTMENT or DAMAGED`,
            );
          }
          const qty = Number(item.quantity);
          if (Number.isNaN(qty) || qty === 0) {
            throw new GraphQLError('Quantity must be a non-zero number');
          }
          if (item.movementType === 'DAMAGED' && qty < 0) {
            throw new GraphQLError('DAMAGED quantity must be positive');
          }
        }

        // 1. Generate adjustment number
        const adjustmentNo = await stockAdjustmentRepository.generateAdjustmentNo(tx);

        // 2. Create header
        const header = await stockAdjustmentRepository.createStockAdjustment(
          {
            organizationId,
            adjustmentNo,
            reason: input.reason ?? null,
            notes: input.notes ?? null,
            createdBy: userId,
            updatedBy: userId,
          },
          tx,
        );

        // 3. Create line items
        const itemRows = input.items.map((item, idx) => ({
          stockAdjustmentId: header.id,
          skuId: item.skuId,
          rackId: item.rackId!.trim(),
          lotNo: item.lotNo?.trim() ? item.lotNo.trim() : null,
          expiryDate: parsedExpiries[idx],
          movementType: item.movementType,
          quantity: item.quantity,
          remarks: item.remarks ?? null,
          createdBy: userId,
        }));
        await stockAdjustmentRepository.createStockAdjustmentItems(itemRows, tx);

        // 4. Create inventory movements (updates balances automatically)
        const movementData = input.items.map((item, idx) => ({
          skuId: item.skuId,
          movementType: item.movementType as InventoryMovementType,
          quantity: item.quantity,
          referenceNo: adjustmentNo,
          stockAdjustmentId: header.id,
          rackId: item.rackId!.trim(),
          lotNo: item.lotNo?.trim() ? item.lotNo.trim() : null,
          expiryDate: parsedExpiries[idx],
          reason: item.remarks || input.reason || 'Stock Adjustment',
          createdBy: userId,
        }));

        await inventoryMovementRepository.createInventoryMovement(
          movementData,
          userId,
          organizationId,
          tx,
        );

        return transformStockAdjustment(header);
      },
    ),
  },
};
