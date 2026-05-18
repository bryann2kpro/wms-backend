import { GraphQLError } from "graphql";
import type { GraphQLContext } from "@/graphql/context";
import { racksRepository } from "@/composition-root";
import { db } from "@/db";
import { logger } from "@/util/logger";
import { StockQuantRepositoryClass } from "../stock-quant.repository";
import {
  executePutawayStockQuantTransfer,
  normalizedPutawayLotNo,
  parsePutawayTransferQty,
  qtyPutawayToDbString,
  roundQtyPutaway,
} from "./putaway-stock-move.service";
import { PutawayRepositoryClass } from "./putaway.repository";
import { PUTAWAY_STATUS } from "./putaway.model";
import type { PutawayListRow } from "./putaway.repository";

const putawayRepository = new PutawayRepositoryClass();
const stockQuantRepository = new StockQuantRepositoryClass();

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function graphPutawayLine(row: PutawayListRow) {
  return {
    id: row.id,
    status: row.status as "DRAFT" | "APPROVED" | "FAIL" | "REJECT",
    skuId: row.skuId,
    skuCode: row.skuCode ?? null,
    description: row.description ?? null,
    sourceRackId: row.sourceRackId,
    sourceRackLabel: row.sourceRackLabel ?? null,
    destinationRackId: row.destinationRackId,
    destinationRackLabel: row.destinationRackLabel ?? null,
    sourceStockQuantId: row.sourceStockQuantId,
    sourceLotNo: row.lotNo ?? row.sourceLotNo ?? null,
    quantity: row.quantity?.toString?.() ?? "0",
    failureMessage: row.failureMessage ?? null,
    createdAt: toIso(row.createdAt) ?? "",
    updatedAt: toIso(row.updatedAt) ?? "",
  };
}

export const resolvers = {
  Query: {
    putawayLines: async (
      _: unknown,
      args: { filter?: { status?: string }; limit?: number },
      context: GraphQLContext,
    ) => {
      const organizationId = context.organizationId;
      if (!organizationId) throw new GraphQLError("Not authenticated");

      const status = args.filter?.status ?? PUTAWAY_STATUS.DRAFT;
      const limit = args.limit ?? 100;
      const rows = await putawayRepository.listRecent(
        organizationId,
        { status, limit },
      );
      return rows.map(graphPutawayLine);
    },
  },

  Mutation: {
    createPutawayDraft: async (
      _: unknown,
      args: {
        input: {
          sourceStockQuantId: string;
          destinationRackId: string;
          quantity: string;
          sourceLotNo?: string | null;
        };
      },
      context: GraphQLContext,
    ) => {
      const organizationId = context.organizationId;
      const userId = context.user?.id;
      if (!organizationId || !userId) throw new GraphQLError("Not authenticated");

      const destRack = await racksRepository.getRackById(args.input.destinationRackId, organizationId);
      if (!destRack) {
        throw new GraphQLError("Destination rack was not found.");
      }

      const source = await stockQuantRepository.getStockQuantById(
        organizationId,
        args.input.sourceStockQuantId,
      );
      if (!source) {
        throw new GraphQLError(
          "No stock quant found for the source rack and SKU.",
        );
      }

      const parsed = parsePutawayTransferQty(args.input.quantity);
      if (!parsed.ok) {
        throw new GraphQLError(parsed.message);
      }

      const available = roundQtyPutaway(Number(source.quantity));
      if (!Number.isFinite(available)) {
        throw new GraphQLError("Invalid on-hand quantity on the source stock quant.");
      }

      if (parsed.value > available) {
        throw new GraphQLError(
          `Quantity exceeds available stock (${qtyPutawayToDbString(available)} on hand).`,
        );
      }

      if (args.input.destinationRackId === source.rackId) {
        throw new GraphQLError("Destination rack must be different from the source rack.");
      }

      const draftLotNo =
        args.input.sourceLotNo !== undefined
          ? normalizedPutawayLotNo(args.input.sourceLotNo)
          : normalizedPutawayLotNo(source.lotNo);

      const created = await putawayRepository.insert({
        organizationId,
        skuId: source.skuId,
        lotNo: draftLotNo,
        description: source.description ?? null,
        sourceRackId: source.rackId,
        destinationRackId: args.input.destinationRackId,
        sourceStockQuantId: args.input.sourceStockQuantId,
        quantity: qtyPutawayToDbString(parsed.value),
        status: PUTAWAY_STATUS.DRAFT,
        failureMessage: null,
        createdBy: userId,
        updatedBy: userId,
      });

      const loaded = await putawayRepository.getById(organizationId, created.id);
      if (!loaded) {
        logger.error("[createPutawayDraft] Could not reload putaway row", { id: created.id });
        throw new GraphQLError("Putaway draft was created but could not be loaded.");
      }
      return graphPutawayLine(loaded);
    },

    approvePutawayLine: async (_: unknown, args: { id: string }, context: GraphQLContext) => {
      const organizationId = context.organizationId;
      const userId = context.user?.id;
      if (!organizationId || !userId) {
        throw new GraphQLError("Not authenticated");
      }

      try {
        return await db.transaction(async (tx) => {
          const row = await putawayRepository.getById(organizationId, args.id, tx);
          if (!row || row.status !== PUTAWAY_STATUS.DRAFT) {
            return {
              success: false,
              message: "Putaway line is missing or already processed.",
            };
          }

          const destStillThere = await racksRepository.getRackById(
            row.destinationRackId,
            organizationId,
          );
          if (!destStillThere) {
            await putawayRepository.update(
              organizationId,
              args.id,
              {
                status: PUTAWAY_STATUS.FAIL,
                failureMessage: "Destination rack was not found.",
                updatedBy: userId,
              },
              tx,
            );
            return { success: false, message: "Destination rack was not found." };
          }

          const transfer = await executePutawayStockQuantTransfer({
            tx,
            organizationId,
            userId,
            sourceStockQuantId: row.sourceStockQuantId,
            destinationRackId: row.destinationRackId,
            quantity: row.quantity?.toString?.() ?? "0",
          });

          if (!transfer.success) {
            await putawayRepository.update(
              organizationId,
              args.id,
              {
                status: PUTAWAY_STATUS.FAIL,
                failureMessage: transfer.message,
                updatedBy: userId,
              },
              tx,
            );
            return transfer;
          }

          await putawayRepository.update(
            organizationId,
            args.id,
            {
              status: PUTAWAY_STATUS.APPROVED,
              failureMessage: null,
              updatedBy: userId,
            },
            tx,
          );

          return transfer;
        });
      } catch (error) {
        logger.error("[approvePutawayLine]", error);
        const msg =
          error instanceof Error ? error.message : "Transfer failed due to a server error.";
        /** DB transaction rolled back — leave line as DRAFT so the user can retry. */
        return { success: false, message: msg };
      }
    },

    rejectPutawayLine: async (_: unknown, args: { id: string }, context: GraphQLContext) => {
      const organizationId = context.organizationId;
      const userId = context.user?.id;
      if (!organizationId || !userId) throw new GraphQLError("Not authenticated");

      const loaded = await putawayRepository.rejectDraft(organizationId, args.id, userId);
      if (!loaded) {
        throw new GraphQLError("Putaway line was not found or is not a draft.");
      }
      return graphPutawayLine(loaded);
    },
  },
};
