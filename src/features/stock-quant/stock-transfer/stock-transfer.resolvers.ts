/**
 * Stock Transfer GraphQL Resolvers
 *
 * @description Resolver functions for Stock Transfer operations (bin-to-bin and
 * warehouse-to-warehouse). Type definitions are in stock-transfer.typeDefs.ts.
 *
 * Mutations are wrapped in withAudit, which opens a db.transaction and injects
 * context.tx. The service does NOT open its own transaction, so we pass that
 * context.tx straight through (no nested transaction).
 */

import {
  stockTransferService,
  stockTransferRepository,
  skuRepository,
  authRepository,
  racksRepository,
} from '@/composition-root';
import { withAudit } from '@/features/audit-log/audit.wrapper';
import { GraphQLContext } from '@/graphql/context';
import { GraphQLError } from 'graphql';
import { logger } from '@/util/logger';
import type { RackType } from '@/features/master-data/racks.model';
import type { StockTransferFilter } from './stock-transfer.repository';
import type {
  StockTransferType,
  StockTransferItemType,
} from './stock-transfer.model';

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

function transformStockTransfer(transfer: StockTransferType) {
  return {
    id: transfer.id,
    organizationId: transfer.organizationId,
    transferNo: transfer.transferNo,
    type: transfer.type,
    status: transfer.status,
    sourceWarehouseId: transfer.sourceWarehouseId ?? null,
    destinationWarehouseId: transfer.destinationWarehouseId ?? null,
    remarks: transfer.remarks ?? null,
    dispatchedAt: transfer.dispatchedAt ? transfer.dispatchedAt.toISOString() : null,
    receivedAt: transfer.receivedAt ? transfer.receivedAt.toISOString() : null,
    receivedBy: transfer.receivedBy ?? null,
    cancelledAt: transfer.cancelledAt ? transfer.cancelledAt.toISOString() : null,
    cancelledBy: transfer.cancelledBy ?? null,
    cancelReason: transfer.cancelReason ?? null,
    createdAt: transfer.createdAt.toISOString(),
    updatedAt: transfer.updatedAt.toISOString(),
    createdBy: transfer.createdBy,
    updatedBy: transfer.updatedBy ?? null,
  };
}

export const resolvers = {
  Query: {
    stockTransfers: async (
      _: unknown,
      args: {
        filter?: StockTransferFilter;
        pageSize?: number;
        pageNumber?: number;
      },
      context: GraphQLContext,
    ) => {
      try {
        const organizationId = context.organizationId;
        if (!organizationId) {
          throw new GraphQLError('Organization context required');
        }
        const filter: StockTransferFilter = args.filter || {};

        const pageSize = args.pageSize;
        const pageNumber = args.pageNumber;
        const paginationParams =
          pageSize != null && pageNumber != null
            ? { pageSize, pageNumber }
            : undefined;

        const result = await stockTransferRepository.listStockTransfers(
          organizationId,
          filter,
          paginationParams,
        );

        return {
          query: result.query.map(transformStockTransfer),
          pagination: result.pagination,
        };
      } catch (error) {
        logger.error('[stock-transfer.resolver] stockTransfers Error:', error);
        return false;
      }
    },

    stockTransfer: async (
      _: unknown,
      args: { id: string },
      context: GraphQLContext,
    ) => {
      try {
        const organizationId = context.organizationId;
        if (!organizationId) {
          throw new GraphQLError('Organization context required');
        }

        const transfer = await stockTransferRepository.getStockTransferById(
          args.id,
          organizationId,
        );
        if (!transfer) return null;

        return transformStockTransfer(transfer);
      } catch (error) {
        logger.error('[stock-transfer.resolver] stockTransfer Error:', error);
        return null;
      }
    },
  },

  StockTransfer: {
    createdByUser: async (parent: { createdBy?: string | null }) => {
      if (!parent.createdBy) return null;
      const user = await authRepository.getUserById(parent.createdBy);
      return user ? { id: user.id, displayName: user.displayName } : null;
    },

    items: async (parent: { id: string }) => {
      const items = await stockTransferRepository.getStockTransferItems(parent.id);

      const skuIds = [...new Set(items.map((item) => item.skuId))];
      const skuMap = new Map<string, { skuCode: string | null; skuDescription: string | null }>();
      if (skuIds.length > 0) {
        const skuResult = await skuRepository.getSku({ skuId: skuIds });
        for (const s of skuResult.query) {
          skuMap.set(s.skuId, { skuCode: s.skuCode ?? null, skuDescription: s.skuDescription ?? null });
        }
      }

      return items.map((item: StockTransferItemType) => {
        const sku = skuMap.get(item.skuId);
        return {
          id: item.id,
          stockTransferId: item.stockTransferId,
          skuId: item.skuId,
          skuCode: sku?.skuCode ?? null,
          skuDescription: sku?.skuDescription ?? null,
          lotNo: item.lotNo ?? null,
          expiryDate: item.expiryDate ? item.expiryDate.toISOString() : null,
          quantity: item.quantity,
          lossQuantity: item.lossQuantity ?? "0",
          sourceRackId: item.sourceRackId,
          destinationRackId: item.destinationRackId,
          sourceStockQuantId: item.sourceStockQuantId,
          createdAt: item.createdAt.toISOString(),
        };
      });
    },
  },

  StockTransferItem: {
    sourceRack: async (
      parent: { sourceRackId?: string | null },
      _args: unknown,
      context: GraphQLContext,
    ) => {
      if (!parent.sourceRackId || !context.organizationId) return null;
      const result = await racksRepository.getRack(
        { rackId: [parent.sourceRackId] },
        { pageSize: 1, pageNumber: 1 },
        context.organizationId,
      );
      const rack = result.query[0];
      return rack ? rackToGraphql(rack) : null;
    },

    destinationRack: async (
      parent: { destinationRackId?: string | null },
      _args: unknown,
      context: GraphQLContext,
    ) => {
      if (!parent.destinationRackId || !context.organizationId) return null;
      const result = await racksRepository.getRack(
        { rackId: [parent.destinationRackId] },
        { pageSize: 1, pageNumber: 1 },
        context.organizationId,
      );
      const rack = result.query[0];
      return rack ? rackToGraphql(rack) : null;
    },
  },

  Mutation: {
    createStockTransfer: withAudit(
      {
        entity: 'StockTransfer',
        action: 'CREATE',
        getEntityId: (result) => (result as any)?.id ?? null,
      },
      async (
        _: unknown,
        {
          input,
        }: {
          input: {
            remarks?: string | null;
            lines: Array<{
              sourceStockQuantId: string;
              destinationRackId: string;
              quantity: string;
              lossQuantity?: string | null;
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
        if (!input.lines?.length) {
          throw new GraphQLError('At least one transfer line is required');
        }

        const transfer = await stockTransferService.createTransferDraft(
          {
            remarks: input.remarks ?? null,
            lines: input.lines.map((line) => ({
              sourceStockQuantId: line.sourceStockQuantId,
              destinationRackId: line.destinationRackId,
              quantity: line.quantity,
              lossQuantity: line.lossQuantity ?? "0",
            })),
          },
          tx,
          userId,
          organizationId,
        );

        return transformStockTransfer(transfer);
      },
    ),

    approveStockTransfer: withAudit(
      {
        entity: 'StockTransfer',
        action: 'UPDATE',
        getEntityId: (_result, args) => (args as { id: string }).id,
      },
      async (
        _: unknown,
        { id }: { id: string },
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

        const transfer = await stockTransferService.approveTransfer(
          id,
          organizationId,
          userId,
          tx,
        );

        return transformStockTransfer(transfer);
      },
    ),

    rejectStockTransfer: withAudit(
      {
        entity: 'StockTransfer',
        action: 'UPDATE',
        getEntityId: (_result, args) => (args as { id: string }).id,
      },
      async (
        _: unknown,
        { id }: { id: string },
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

        const transfer = await stockTransferService.rejectTransferDraft(
          id,
          organizationId,
          userId,
          tx,
        );

        return transformStockTransfer(transfer);
      },
    ),

    receiveStockTransfer: withAudit(
      {
        entity: 'StockTransfer',
        action: 'UPDATE',
        getEntityId: (_result, args) => (args as { id: string }).id,
      },
      async (
        _: unknown,
        { id }: { id: string },
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

        const transfer = await stockTransferService.receiveTransfer(
          id,
          organizationId,
          userId,
          tx,
        );

        return transformStockTransfer(transfer);
      },
    ),

    cancelStockTransfer: withAudit(
      {
        entity: 'StockTransfer',
        action: 'UPDATE',
        getEntityId: (_result, args) => (args as { id: string }).id,
      },
      async (
        _: unknown,
        { id, reason }: { id: string; reason: string },
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
        if (!reason?.trim()) {
          throw new GraphQLError('A cancellation reason is required');
        }

        const transfer = await stockTransferService.cancelTransfer(
          id,
          organizationId,
          userId,
          reason,
          tx,
        );

        return transformStockTransfer(transfer);
      },
    ),

    dispatchStockTransfer: withAudit(
      {
        entity: 'StockTransfer',
        action: 'UPDATE',
        getEntityId: (_result, args) => (args as { id: string }).id,
      },
      async (
        _: unknown,
        { id }: { id: string },
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

        const transfer = await stockTransferService.dispatchTransfer(
          id,
          organizationId,
          userId,
          tx,
        );

        return transformStockTransfer(transfer);
      },
    ),
  },
};
