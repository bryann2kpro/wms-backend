/**
 * Returns GraphQL Resolvers
 *
 * @description Resolver functions for Return Management.
 * Type definitions are in returns.typeDefs.ts
 */

import { returnsRepository, returnsService, authRepository } from '@/composition-root';
import { withAudit } from '@/features/audit-log/audit.wrapper';
import type { GraphQLContext } from '@/graphql/context';
import { GraphQLError } from 'graphql';
import { logger } from '@/util/logger';
import type { ReturnDocType, ReturnFilter } from './returns.model';
import type { ReturnItemWithDetails } from './returns.repository';
import type { ReturnLineInput } from './returns.service';

// ============================================
// HELPERS
// ============================================

function transformReturn(row: ReturnDocType) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    returnNo: row.returnNo,
    doId: row.doId,
    doNo: row.doNo,
    purchaseOrderId: row.purchaseOrderId,
    poNo: row.poNo,
    status: row.status,
    receivedBy: row.receivedBy,
    receivedAt: row.receivedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function transformReturnItem(item: ReturnItemWithDetails) {
  return {
    id: item.id,
    returnId: item.returnId,
    doItemId: item.doItemId ?? null,
    skuId: item.skuId,
    skuCode: item.skuCode ?? null,
    skuDescription: item.skuDescription ?? null,
    lotNo: item.lotNo ?? null,
    expiryDate: item.expiryDate ? item.expiryDate.toISOString() : null,
    qtyReturned: item.qtyReturned,
    reason: item.reason,
    conditionNotes: item.conditionNotes ?? null,
    status: item.status,
    qtyPutaway: item.qtyPutaway,
    assignedRackId: item.assignedRackId ?? null,
    assignedRackLabel: item.assignedRackId ? item.assignedRackLabel ?? null : null,
    assignedBy: item.assignedBy ?? null,
    assignedAt: item.assignedAt ? item.assignedAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
  };
}

function requireAuthContext(context: GraphQLContext): { userId: string; organizationId: string } {
  const userId = context.user?.id;
  if (!userId) {
    throw new GraphQLError('Authentication required', {
      extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } },
    });
  }
  const organizationId = context.organizationId;
  if (!organizationId) {
    throw new GraphQLError('Organization context required');
  }
  return { userId, organizationId };
}

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  Query: {
    returns: async (
      _: unknown,
      args: { filter?: ReturnFilter; pageSize?: number; pageNumber?: number },
      context: GraphQLContext,
    ) => {
      try {
        const result = await returnsRepository.listReturns(
          args.filter ?? {},
          { pageSize: args.pageSize ?? 10, pageNumber: args.pageNumber ?? 1 },
          context.organizationId ?? undefined,
        );
        return {
          query: result.query.map(transformReturn),
          pagination: result.pagination,
        };
      } catch (error) {
        logger.error('❌ [returns.resolvers.returns] Error:', error);
        throw error;
      }
    },

    returnDoc: async (_: unknown, args: { id: string }, context: GraphQLContext) => {
      try {
        const row = await returnsRepository.getReturnById(args.id, context.organizationId ?? undefined);
        return row ? transformReturn(row) : null;
      } catch (error) {
        logger.error('❌ [returns.resolvers.returnDoc] Error:', error);
        throw error;
      }
    },

    returnsStats: async (_: unknown, __: unknown, context: GraphQLContext) => {
      try {
        const { organizationId } = requireAuthContext(context);
        return await returnsRepository.getReturnsStats(organizationId);
      } catch (error) {
        logger.error('❌ [returns.resolvers.returnsStats] Error:', error);
        throw error;
      }
    },
  },

  Return: {
    receivedByUser: async (parent: { receivedBy?: string | null }) => {
      if (!parent.receivedBy) return null;
      const user = await authRepository.getUserById(parent.receivedBy);
      return user ? { id: user.id, displayName: user.displayName } : null;
    },

    items: async (parent: { id: string }) => {
      const items = await returnsRepository.getReturnItems(parent.id);
      return items.map(transformReturnItem);
    },
  },

  ReturnItem: {
    photos: async (parent: { id: string }) => {
      const docs = await returnsRepository.getReturnItemDocuments([parent.id]);
      return docs.map((doc) => ({
        id: doc.id,
        fileName: doc.fileName,
        url: doc.url ?? null,
        mimeType: doc.mimeType,
        uploadedAt: doc.uploadedAt.toISOString(),
      }));
    },
  },

  Mutation: {
    createReturn: withAudit<
      unknown,
      { doId: string; items: ReturnLineInput[]; notes?: string | null },
      unknown
    >(
      {
        entity: 'Return',
        action: 'CREATE',
        getEntityId: (result) =>
          result && typeof result === 'object' && 'id' in result ? (result as { id: string }).id : null,
      },
      async (_: unknown, { doId, items, notes }, context: GraphQLContext) => {
        const { userId, organizationId } = requireAuthContext(context);
        logger.info('ℹ️ [returns.resolvers.createReturn] Creating return...');
        const created = await returnsService.createReturn({
          doId,
          items,
          notes: notes ?? null,
          userId,
          organizationId,
        });
        logger.info(`✅ [returns.resolvers.createReturn] Return ${created.returnNo} created`);
        return transformReturn(created);
      },
    ),

    assignReturnItemToRack: withAudit<
      unknown,
      { returnItemId: string; rackId: string; qty?: string | null },
      unknown
    >(
      {
        entity: 'ReturnItem',
        action: 'UPDATE',
        getEntityId: (result) =>
          result && typeof result === 'object' && 'id' in result ? (result as { id: string }).id : null,
      },
      async (_: unknown, { returnItemId, rackId, qty }, context: GraphQLContext) => {
        const { userId, organizationId } = requireAuthContext(context);
        logger.info('ℹ️ [returns.resolvers.assignReturnItemToRack] Assigning return item...');
        const updated = await returnsService.assignReturnItemToRack({
          returnItemId,
          rackId,
          qty: qty ?? null,
          userId,
          organizationId,
        });
        // Re-read with SKU/rack joins for the response payload
        const items = await returnsRepository.getReturnItems(updated.returnId);
        const item = items.find((i) => i.id === updated.id);
        if (!item) throw new GraphQLError('Return item not found after assignment');
        logger.info('✅ [returns.resolvers.assignReturnItemToRack] Return item assigned');
        return transformReturnItem(item);
      },
    ),
  },
};
