import { GraphQLError } from "graphql";
import type { GraphQLContext } from "@/graphql/context";
import { logger } from "@/util/logger";
import {
  StockQuantTransactionFilter,
  StockQuantTransactionRepositoryClass,
} from "./stock-quant-transaction.repository";

const stockQuantTransactionRepository = new StockQuantTransactionRepositoryClass();

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function transformStockQuantTransaction(row: Record<string, unknown>) {
  return {
    ...row,
    quantity: (row.quantity as { toString?: () => string } | undefined)?.toString?.() ?? "0",
    createdAt: toIso(row.createdAt as Date | string | undefined),
    updatedAt: toIso(row.updatedAt as Date | string | undefined),
  };
}

export const resolvers = {
  Query: {
    stockQuantTransactions: async (
      _: unknown,
      args: {
        filter?: {
          id?: string;
          skuId?: string;
          skuIds?: string[];
          sourceRackId?: string;
          sourceRackIds?: string[];
          destinationRackId?: string;
          destinationRackIds?: string[];
          type?: string;
        };
        pageSize?: number;
        pageNumber?: number;
      },
      context: GraphQLContext,
    ) => {
      try {
        const organizationId = context.organizationId;
        if (!organizationId) throw new GraphQLError("Not authenticated");

        const filter: StockQuantTransactionFilter = {};
        if (args.filter) {
          if (args.filter.id) filter.id = args.filter.id;
          if (args.filter.skuIds) filter.skuId = args.filter.skuIds;
          else if (args.filter.skuId) filter.skuId = args.filter.skuId;

          if (args.filter.sourceRackIds) filter.sourceRackId = args.filter.sourceRackIds;
          else if (args.filter.sourceRackId) filter.sourceRackId = args.filter.sourceRackId;

          if (args.filter.destinationRackIds) filter.destinationRackId = args.filter.destinationRackIds;
          else if (args.filter.destinationRackId) filter.destinationRackId = args.filter.destinationRackId;

          if (args.filter.type) filter.type = args.filter.type;
        }

        const result = await stockQuantTransactionRepository.getStockQuantTransactions(
          organizationId,
          filter,
          {
            pageSize: args.pageSize,
            pageNumber: args.pageNumber,
          },
        );

        return {
          query: result.query.map(transformStockQuantTransaction),
          pagination: result.pagination,
        };
      } catch (error) {
        logger.error("[stockQuantTransactions resolver]", error);
        throw error;
      }
    },

    stockQuantTransaction: async (
      _: unknown,
      args: { id: string },
      context: GraphQLContext,
    ) => {
      try {
        const organizationId = context.organizationId;
        if (!organizationId) throw new GraphQLError("Not authenticated");

        const row = await stockQuantTransactionRepository.getStockQuantTransactionById(
          organizationId,
          args.id,
        );
        if (!row) return null;
        return transformStockQuantTransaction(row as unknown as Record<string, unknown>);
      } catch (error) {
        logger.error("[stockQuantTransaction resolver]", error);
        throw error;
      }
    },
  },

  Mutation: {
    createStockQuantTransaction: async (
      _: unknown,
      args: {
        input: {
          skuId: string;
          lotNo?: string | null;
          description?: string | null;
          quantity: string;
          sourceRackId: string;
          destinationRackId?: string | null;
          type?: string | null;
        };
      },
      context: GraphQLContext,
    ) => {
      try {
        const organizationId = context.organizationId;
        const userId = context.user?.id;
        if (!organizationId || !userId) throw new GraphQLError("Not authenticated");

        const created = await stockQuantTransactionRepository.createStockQuantTransaction(
          {
            skuId: args.input.skuId,
            lotNo: args.input.lotNo?.trim() || null,
            description: args.input.description ?? null,
            quantity: args.input.quantity,
            sourceRackId: args.input.sourceRackId,
            destinationRackId: args.input.destinationRackId ?? null,
            type: args.input.type ?? null,
            organizationId,
            createdBy: userId,
            updatedBy: userId,
          },
          context.tx,
        );

        return transformStockQuantTransaction(created as unknown as Record<string, unknown>);
      } catch (error) {
        logger.error("[createStockQuantTransaction resolver]", error);
        throw error;
      }
    },

    updateStockQuantTransaction: async (
      _: unknown,
      args: {
        id: string;
        input: {
          lotNo?: string | null;
          description?: string | null;
          quantity?: string;
          sourceRackId?: string;
          destinationRackId?: string;
          type?: string | null;
        };
      },
      context: GraphQLContext,
    ) => {
      try {
        const organizationId = context.organizationId;
        const userId = context.user?.id;
        if (!organizationId || !userId) throw new GraphQLError("Not authenticated");

        const updated = await stockQuantTransactionRepository.updateStockQuantTransaction(
          organizationId,
          args.id,
          {
            lotNo: args.input.lotNo?.trim() || null,
            description: args.input.description,
            quantity: args.input.quantity,
            sourceRackId: args.input.sourceRackId,
            destinationRackId: args.input.destinationRackId,
            type: args.input.type,
            updatedBy: userId,
          },
          context.tx,
        );

        if (!updated) return null;
        return transformStockQuantTransaction(updated as unknown as Record<string, unknown>);
      } catch (error) {
        logger.error("[updateStockQuantTransaction resolver]", error);
        throw error;
      }
    },

    deleteStockQuantTransaction: async (
      _: unknown,
      args: { id: string },
      context: GraphQLContext,
    ) => {
      try {
        const organizationId = context.organizationId;
        if (!organizationId) throw new GraphQLError("Not authenticated");

        return await stockQuantTransactionRepository.deleteStockQuantTransaction(
          organizationId,
          args.id,
          context.tx,
        );
      } catch (error) {
        logger.error("[deleteStockQuantTransaction resolver]", error);
        throw error;
      }
    },
  },
};
