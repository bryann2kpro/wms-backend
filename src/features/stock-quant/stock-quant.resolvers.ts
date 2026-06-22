import { GraphQLError } from "graphql";
import type { GraphQLContext } from "@/graphql/context";
import { logger } from "@/util/logger";
import {
  StockQuantFilter,
  StockQuantRepositoryClass,
} from "./stock-quant.repository";

const stockQuantRepository = new StockQuantRepositoryClass();

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function transformStockQuant(row: any) {
  return {
    ...row,
    quantity: row.quantity?.toString?.() ?? "0",
    reservedQty: row.reservedQty?.toString?.() ?? "0",
    lossQty: row.lossQty?.toString?.() ?? "0",
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    expiryDate: toIso(row.expiryDate),
  };
}

export const resolvers = {
  Query: {
    stockQuants: async (
      _: unknown,
      args: {
        filter?: {
          id?: string;
          skuId?: string;
          skuIds?: string[];
          skuCode?: string;
          rackId?: string;
          rackIds?: string[];
          rackLabel?: string;
        };
        pageSize?: number;
        pageNumber?: number;
      },
      context: GraphQLContext,
    ) => {
      try {
        const organizationId = context.organizationId;
        if (!organizationId) throw new GraphQLError("Not authenticated");

        const filter: StockQuantFilter = {};
        if (args.filter) {
          if (args.filter.id) filter.id = args.filter.id;
          if (args.filter.skuIds) filter.skuId = args.filter.skuIds;
          else if (args.filter.skuId) filter.skuId = args.filter.skuId;

          if (args.filter.rackIds) filter.rackId = args.filter.rackIds;
          else if (args.filter.rackId) filter.rackId = args.filter.rackId;

          if (args.filter.skuCode?.trim()) filter.skuCode = args.filter.skuCode.trim();
          if (args.filter.rackLabel?.trim()) filter.rackLabel = args.filter.rackLabel.trim();
        }

        const result = await stockQuantRepository.getStockQuants(
          organizationId,
          filter,
          {
            pageSize: args.pageSize,
            pageNumber: args.pageNumber,
          },
        );

        return {
          query: result.query.map(transformStockQuant),
          pagination: result.pagination,
          totalQuantity: result.totalQuantity,
        };
      } catch (error) {
        logger.error("[stockQuants resolver]", error);
        throw error;
      }
    },

    stockQuant: async (
      _: unknown,
      args: { id: string },
      context: GraphQLContext,
    ) => {
      try {
        const organizationId = context.organizationId;
        if (!organizationId) throw new GraphQLError("Not authenticated");

        const row = await stockQuantRepository.getStockQuantById(
          organizationId,
          args.id,
        );
        if (!row) return null;
        return transformStockQuant(row);
      } catch (error) {
        logger.error("[stockQuant resolver]", error);
        throw error;
      }
    },
  },

  Mutation: {
    createStockQuant: async (
      _: unknown,
      args: {
        input: {
          skuId: string;
          description?: string | null;
          quantity: string;
          rackId: string;
        };
      },
      context: GraphQLContext,
    ) => {
      try {
        const organizationId = context.organizationId;
        const userId = context.user?.id;
        if (!organizationId || !userId) throw new GraphQLError("Not authenticated");

        const created = await stockQuantRepository.createStockQuant(
          {
            skuId: args.input.skuId,
            description: args.input.description ?? null,
            quantity: args.input.quantity,
            rackId: args.input.rackId,
            organizationId,
            createdBy: userId,
            updatedBy: userId,
          },
          context.tx,
        );

        return transformStockQuant(created);
      } catch (error) {
        logger.error("[createStockQuant resolver]", error);
        throw error;
      }
    },

    updateStockQuant: async (
      _: unknown,
      args: {
        id: string;
        input: {
          description?: string | null;
          quantity?: string;
          lossQty?: string;
          rackId?: string;
        };
      },
      context: GraphQLContext,
    ) => {
      try {
        const organizationId = context.organizationId;
        const userId = context.user?.id;
        if (!organizationId || !userId) throw new GraphQLError("Not authenticated");

        const updated = await stockQuantRepository.updateStockQuant(
          organizationId,
          args.id,
          {
            description: args.input.description,
            quantity: args.input.quantity,
            lossQty: args.input.lossQty,
            rackId: args.input.rackId,
            updatedBy: userId,
          },
          context.tx,
        );

        if (!updated) return null;
        return transformStockQuant(updated);
      } catch (error) {
        logger.error("[updateStockQuant resolver]", error);
        throw error;
      }
    },

    deleteStockQuant: async (
      _: unknown,
      args: { id: string },
      context: GraphQLContext,
    ) => {
      try {
        const organizationId = context.organizationId;
        if (!organizationId) throw new GraphQLError("Not authenticated");

        return await stockQuantRepository.deleteStockQuant(
          organizationId,
          args.id,
          context.tx,
        );
      } catch (error) {
        logger.error("[deleteStockQuant resolver]", error);
        throw error;
      }
    },
  },
};
