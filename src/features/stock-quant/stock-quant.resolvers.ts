import { GraphQLError } from "graphql";
import type { GraphQLContext } from "@/graphql/context";
import { racksRepository } from "@/composition-root";
import { db } from "@/db";
import { logger } from "@/util/logger";
import {
  StockQuantFilter,
  StockQuantRepositoryClass,
} from "./stock-quant.repository";
import { StockQuantTransactionRepositoryClass } from "./stock-quant-transaction/stock-quant-transaction.repository";

const stockQuantRepository = new StockQuantRepositoryClass();
const stockQuantTransactionRepository = new StockQuantTransactionRepositoryClass();

function roundQty2(n: number): number {
  return Math.round(n * 100) / 100;
}

function qtyToDbString(n: number): string {
  return roundQty2(n).toFixed(2);
}

function parseTransferQty(
  raw: string,
): { ok: true; value: number } | { ok: false; message: string } {
  const s = String(raw ?? "").trim();
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, message: "Quantity must be a positive number." };
  }
  return { ok: true, value: roundQty2(n) };
}

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
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
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
          rackId?: string;
          rackIds?: string[];
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

    putawayTransferStock: async (
      _: unknown,
      args: {
        input: {
          sourceStockQuantId: string;
          destinationRackId: string;
          quantity: string;
        };
      },
      context: GraphQLContext,
    ) => {
      const organizationId = context.organizationId;
      const userId = context.user?.id;
      if (!organizationId || !userId) {
        throw new GraphQLError("Not authenticated");
      }

      const destRack = await racksRepository.getRackById(
        args.input.destinationRackId,
        organizationId,
      );
      if (!destRack) {
        return {
          success: false,
          message: "Destination rack was not found.",
        };
      }

      try {
        const result = await db.transaction(async (tx) => {
          const source = await stockQuantRepository.getStockQuantById(
            organizationId,
            args.input.sourceStockQuantId,
            tx,
          );
          if (!source) {
            return {
              success: false,
              message:
                "No stock quant found for the source. It may have been removed or transferred already.",
            };
          }

          const parsed = parseTransferQty(args.input.quantity);
          if (!parsed.ok) {
            return { success: false, message: parsed.message };
          }

          const available = roundQty2(Number(source.quantity));
          if (!Number.isFinite(available)) {
            return {
              success: false,
              message: "Invalid on-hand quantity on the source stock quant.",
            };
          }

          if (parsed.value > available) {
            return {
              success: false,
              message: `Quantity exceeds available stock (${qtyToDbString(available)} on hand).`,
            };
          }

          if (args.input.destinationRackId === source.rackId) {
            return {
              success: false,
              message: "Destination rack must be different from the source rack.",
            };
          }

          const remaining = roundQty2(available - parsed.value);
          if (remaining <= 0) {
            await stockQuantRepository.deleteStockQuant(organizationId, source.id, tx);
          } else {
            await stockQuantRepository.updateStockQuant(
              organizationId,
              source.id,
              { quantity: qtyToDbString(remaining), updatedBy: userId },
              tx,
            );
          }

          const destRow = await stockQuantRepository.getStockQuantBySkuAndRack(
            organizationId,
            source.skuId,
            args.input.destinationRackId,
            tx,
          );

          if (destRow) {
            const newDestQty = roundQty2(Number(destRow.quantity) + parsed.value);
            await stockQuantRepository.updateStockQuant(
              organizationId,
              destRow.id,
              {
                quantity: qtyToDbString(newDestQty),
                description: destRow.description ?? source.description,
                updatedBy: userId,
              },
              tx,
            );
          } else {
            await stockQuantRepository.createStockQuant(
              {
                skuId: source.skuId,
                description: source.description ?? null,
                quantity: qtyToDbString(parsed.value),
                rackId: args.input.destinationRackId,
                organizationId,
                createdBy: userId,
                updatedBy: userId,
              },
              tx,
            );
          }

          await stockQuantTransactionRepository.createStockQuantTransaction(
            {
              skuId: source.skuId,
              description: source.description ?? null,
              quantity: qtyToDbString(parsed.value),
              sourceRackId: source.rackId,
              destinationRackId: args.input.destinationRackId,
              type: "PUTAWAY",
              organizationId,
              createdBy: userId,
              updatedBy: userId,
            },
            tx,
          );

          return {
            success: true,
            message: `Transferred ${qtyToDbString(parsed.value)} units to the destination rack.`,
          };
        });

        return result;
      } catch (error) {
        logger.error("[putawayTransferStock resolver]", error);
        const msg =
          error instanceof Error ? error.message : "Transfer failed due to a server error.";
        return { success: false, message: msg };
      }
    },
  },
};
