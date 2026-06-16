import { GraphQLError } from "graphql";
import { logger } from "@/util/logger";
import type { GraphQLContext } from "@/graphql/context";
import { stockCountSessionService } from "@/composition-root";

// ─── helpers ────────────────────────────────────────────────────────────────

function toFloat(v: string | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function toIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function transformSession(row: any) {
  return {
    ...row,
    countDate: toIso(row.countDate),
    createdAt: toIso(row.createdAt),
    closedAt: toIso(row.closedAt),
    itemCount: Number(row.itemCount ?? 0),
    pendingCount: Number(row.pendingCount ?? 0),
  };
}

function transformItem(row: any) {
  return {
    ...row,
    openingQty: toFloat(row.openingQty),
    openingLossQty: toFloat(row.openingLossQty),
    onHandQty: toFloat(row.onHandQty),
    onHandLossQty: toFloat(row.onHandLossQty),
    reservedQty: toFloat(row.reservedQty),
    qtyDifference: toFloat(row.qtyDifference),
    lossQtyDifference: toFloat(row.lossQtyDifference),
    countedQty: row.countedQty != null ? toFloat(row.countedQty) : null,
    countedLossQty: row.countedLossQty != null ? toFloat(row.countedLossQty) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    approvedAt: toIso(row.approvedAt),
  };
}

// ─── resolvers ──────────────────────────────────────────────────────────────

export const resolvers = {
  Query: {
    stockCountSessions: async (
      _: unknown,
      args: { pageSize?: number; pageNumber?: number },
      context: GraphQLContext
    ) => {
      try {
        const orgId = context.organizationId;
        if (!orgId) throw new GraphQLError("Not authenticated");

        const result = await stockCountSessionService.listSessions(orgId, {
          pageSize: args.pageSize,
          pageNumber: args.pageNumber,
        });

        return {
          query: result.query.map(transformSession),
          pagination: result.pagination,
        };
      } catch (error) {
        logger.error("[stockCountSessions resolver]", error);
        throw error;
      }
    },

    stockCountSession: async (
      _: unknown,
      args: { id: string },
      context: GraphQLContext
    ) => {
      try {
        const orgId = context.organizationId;
        if (!orgId) throw new GraphQLError("Not authenticated");

        const session = await stockCountSessionService.getSession(orgId, args.id);
        if (!session) return null;
        // itemCount / pendingCount not available from getSession — fetch inline
        const items = await stockCountSessionService.getSessionItems(orgId, args.id, undefined, { pageSize: 9999, pageNumber: 1 });
        const pendingCount = items.query.filter((i) => !i.isApproved).length;
        return transformSession({ ...session, itemCount: items.pagination.totalCount, pendingCount });
      } catch (error) {
        logger.error("[stockCountSession resolver]", error);
        throw error;
      }
    },

    stockCountSessionItems: async (
      _: unknown,
      args: {
        sessionId: string;
        search?: string;
        pageSize?: number;
        pageNumber?: number;
      },
      context: GraphQLContext
    ) => {
      try {
        const orgId = context.organizationId;
        if (!orgId) throw new GraphQLError("Not authenticated");

        const result = await stockCountSessionService.getSessionItems(
          orgId,
          args.sessionId,
          args.search,
          { pageSize: args.pageSize, pageNumber: args.pageNumber }
        );

        return {
          query: result.query.map(transformItem),
          pagination: result.pagination,
        };
      } catch (error) {
        logger.error("[stockCountSessionItems resolver]", error);
        throw error;
      }
    },
  },

  Mutation: {
    createStockCountSession: async (
      _: unknown,
      args: { name: string },
      context: GraphQLContext
    ) => {
      try {
        const orgId = context.organizationId;
        const userId = context.user?.id;
        if (!orgId || !userId) throw new GraphQLError("Not authenticated");

        const name = args.name?.trim();
        if (!name) throw new GraphQLError("Session name is required");

        const session = await stockCountSessionService.createSession(orgId, userId, name);
        // Return with placeholder counts (0 pending initially, full itemCount requires a count query)
        return transformSession({ ...session, itemCount: 0, pendingCount: 0 });
      } catch (error) {
        logger.error("[createStockCountSession resolver]", error);
        throw error;
      }
    },

    updateStockCountItem: async (
      _: unknown,
      args: {
        id: string;
        input: {
          action?: string;
          countedQty?: number;
          countedLossQty?: number;
          notes?: string;
          isApproved?: boolean;
        };
      },
      context: GraphQLContext
    ) => {
      try {
        const orgId = context.organizationId;
        const userId = context.user?.id;
        if (!orgId || !userId) throw new GraphQLError("Not authenticated");

        const patch: Record<string, unknown> = {};
        if ("action" in args.input) patch.action = args.input.action;
        if ("countedQty" in args.input) patch.countedQty = args.input.countedQty;
        if ("countedLossQty" in args.input) patch.countedLossQty = args.input.countedLossQty;
        if ("notes" in args.input) patch.notes = args.input.notes;
        if ("imageUrl" in args.input) patch.imageUrl = args.input.imageUrl;
        if (args.input.isApproved === true) {
          patch.isApproved = true;
          patch.approvedBy = userId;
          patch.approvedAt = new Date();
        } else if (args.input.isApproved === false) {
          patch.isApproved = false;
          patch.approvedBy = null;
          patch.approvedAt = null;
        }

        const updated = await stockCountSessionService.updateItem(orgId, args.id, patch as any, userId);
        if (!updated) throw new GraphQLError("Item not found");
        return transformItem(updated);
      } catch (error) {
        logger.error("[updateStockCountItem resolver]", error);
        throw error;
      }
    },

    closeStockCountSession: async (
      _: unknown,
      args: { id: string },
      context: GraphQLContext
    ) => {
      try {
        const orgId = context.organizationId;
        const userId = context.user?.id;
        if (!orgId || !userId) throw new GraphQLError("Not authenticated");

        const session = await stockCountSessionService.closeSession(orgId, args.id, userId);
        if (!session) throw new GraphQLError("Session not found");
        return transformSession({ ...session, itemCount: 0, pendingCount: 0 });
      } catch (error) {
        logger.error("[closeStockCountSession resolver]", error);
        throw error;
      }
    },

    bulkApproveStockCountItems: async (
      _: unknown,
      args: { sessionId: string },
      context: GraphQLContext
    ) => {
      try {
        const orgId = context.organizationId;
        const userId = context.user?.id;
        if (!orgId || !userId) throw new GraphQLError("Not authenticated");

        return await stockCountSessionService.bulkApproveReadyItems(orgId, args.sessionId, userId);
      } catch (error) {
        logger.error("[bulkApproveStockCountItems resolver]", error);
        throw error;
      }
    },
  },
};
