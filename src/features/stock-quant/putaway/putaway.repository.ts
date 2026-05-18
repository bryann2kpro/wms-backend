/**
 * Data access for main.putaway (draft / approved / failed putaway lines).
 */

import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { logger } from "@/util/logger";
import type { DbTransaction } from "@/types/db-transaction";
import { SkuTable } from "@/features/master-data/sku.model";
import { RacksTable } from "@/features/master-data/racks.model";
import { StockQuantTable } from "../stock-quant.model";
import {
  PUTAWAY_STATUS,
  PutawayTable,
  type PutawayInsertType,
  type PutawayType,
} from "./putaway.model";

const PutawaySrcRack = alias(RacksTable, "putaway_src_rack");
const PutawayDstRack = alias(RacksTable, "putaway_dst_rack");

export type PutawayListRow = PutawayType & {
  skuCode: string | null;
  sourceRackLabel: string | null;
  destinationRackLabel: string | null;
  sourceLotNo: string | null;
};

export type PutawayUpdatePatch = {
  status: string;
  /** Set to null to clear after success. */
  failureMessage: string | null;
  updatedBy: string;
};

export class PutawayRepositoryClass {
  async insert(row: PutawayInsertType, tx?: DbTransaction): Promise<PutawayType> {
    try {
      const client = tx ?? db;
      const [created] = await client.insert(PutawayTable).values(row).returning();
      return created;
    } catch (error) {
      logger.error("❌ [PutawayRepository.insert]", error);
      throw error;
    }
  }

  async getById(organizationId: string, id: string, tx?: DbTransaction): Promise<PutawayListRow | null> {
    try {
      const client = tx ?? db;
      const rows = await client
        .select({
          id: PutawayTable.id,
          organizationId: PutawayTable.organizationId,
          skuId: PutawayTable.skuId,
          lotNo: PutawayTable.lotNo,
          description: PutawayTable.description,
          sourceRackId: PutawayTable.sourceRackId,
          destinationRackId: PutawayTable.destinationRackId,
          sourceStockQuantId: PutawayTable.sourceStockQuantId,
          quantity: PutawayTable.quantity,
          status: PutawayTable.status,
          failureMessage: PutawayTable.failureMessage,
          createdAt: PutawayTable.createdAt,
          updatedAt: PutawayTable.updatedAt,
          createdBy: PutawayTable.createdBy,
          updatedBy: PutawayTable.updatedBy,
          skuCode: SkuTable.skuCode,
          sourceRackLabel: sql<string | null>`concat_ws('-', ${PutawaySrcRack.rackRow}, ${PutawaySrcRack.rackLevel}, ${PutawaySrcRack.rackColumn})`,
          destinationRackLabel: sql<string | null>`concat_ws('-', ${PutawayDstRack.rackRow}, ${PutawayDstRack.rackLevel}, ${PutawayDstRack.rackColumn})`,
          sourceLotNo: sql<string | null>`coalesce(${PutawayTable.lotNo}, ${StockQuantTable.lotNo})`,
        })
        .from(PutawayTable)
        .leftJoin(SkuTable, eq(SkuTable.skuId, PutawayTable.skuId))
        .leftJoin(
          StockQuantTable,
          eq(StockQuantTable.id, PutawayTable.sourceStockQuantId),
        )
        .leftJoin(PutawaySrcRack, eq(PutawaySrcRack.rackId, PutawayTable.sourceRackId))
        .leftJoin(PutawayDstRack, eq(PutawayDstRack.rackId, PutawayTable.destinationRackId))
        .where(and(eq(PutawayTable.organizationId, organizationId), eq(PutawayTable.id, id)))
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      logger.error("❌ [PutawayRepository.getById]", error);
      throw error;
    }
  }

  async update(
    organizationId: string,
    id: string,
    patch: PutawayUpdatePatch,
    tx?: DbTransaction,
  ): Promise<PutawayType | null> {
    try {
      const client = tx ?? db;
      const { failureMessage, updatedBy, status } = patch;
      const [row] = await client
        .update(PutawayTable)
        .set({
          status,
          failureMessage,
          updatedBy,
          updatedAt: new Date(),
        })
        .where(and(eq(PutawayTable.organizationId, organizationId), eq(PutawayTable.id, id)))
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error("❌ [PutawayRepository.update]", error);
      throw error;
    }
  }

  /**
   * Mark a DRAFT line as REJECT (no stock movement). Returns null if not found or not DRAFT.
   */
  async rejectDraft(
    organizationId: string,
    id: string,
    userId: string,
    tx?: DbTransaction,
  ): Promise<PutawayListRow | null> {
    try {
      const client = tx ?? db;
      const updated = await client
        .update(PutawayTable)
        .set({
          status: PUTAWAY_STATUS.REJECT,
          failureMessage: null,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(PutawayTable.organizationId, organizationId),
            eq(PutawayTable.id, id),
            eq(PutawayTable.status, PUTAWAY_STATUS.DRAFT),
          ),
        )
        .returning({ id: PutawayTable.id });
      if (updated.length === 0) return null;
      return this.getById(organizationId, id, tx);
    } catch (error) {
      logger.error("❌ [PutawayRepository.rejectDraft]", error);
      throw error;
    }
  }

  /**
   * Recent putaway lines for UI (e.g. drafts for current session). Optional status filter.
   */
  async listRecent(
    organizationId: string,
    opts: { status?: string; limit?: number },
    tx?: DbTransaction,
  ): Promise<PutawayListRow[]> {
    try {
      const client = tx ?? db;
      const limit = Math.min(opts.limit ?? 100, 500);
      const conditions = [eq(PutawayTable.organizationId, organizationId)];
      if (opts.status) {
        conditions.push(eq(PutawayTable.status, opts.status));
      }
      return client
        .select({
          id: PutawayTable.id,
          organizationId: PutawayTable.organizationId,
          skuId: PutawayTable.skuId,
          lotNo: PutawayTable.lotNo,
          description: PutawayTable.description,
          sourceRackId: PutawayTable.sourceRackId,
          destinationRackId: PutawayTable.destinationRackId,
          sourceStockQuantId: PutawayTable.sourceStockQuantId,
          quantity: PutawayTable.quantity,
          status: PutawayTable.status,
          failureMessage: PutawayTable.failureMessage,
          createdAt: PutawayTable.createdAt,
          updatedAt: PutawayTable.updatedAt,
          createdBy: PutawayTable.createdBy,
          updatedBy: PutawayTable.updatedBy,
          skuCode: SkuTable.skuCode,
          sourceRackLabel: sql<string | null>`concat_ws('-', ${PutawaySrcRack.rackRow}, ${PutawaySrcRack.rackLevel}, ${PutawaySrcRack.rackColumn})`,
          destinationRackLabel: sql<string | null>`concat_ws('-', ${PutawayDstRack.rackRow}, ${PutawayDstRack.rackLevel}, ${PutawayDstRack.rackColumn})`,
          sourceLotNo: sql<string | null>`coalesce(${PutawayTable.lotNo}, ${StockQuantTable.lotNo})`,
        })
        .from(PutawayTable)
        .leftJoin(SkuTable, eq(SkuTable.skuId, PutawayTable.skuId))
        .leftJoin(
          StockQuantTable,
          eq(StockQuantTable.id, PutawayTable.sourceStockQuantId),
        )
        .leftJoin(PutawaySrcRack, eq(PutawaySrcRack.rackId, PutawayTable.sourceRackId))
        .leftJoin(PutawayDstRack, eq(PutawayDstRack.rackId, PutawayTable.destinationRackId))
        .where(and(...conditions))
        .orderBy(desc(PutawayTable.createdAt))
        .limit(limit);
    } catch (error) {
      logger.error("❌ [PutawayRepository.listRecent]", error);
      throw error;
    }
  }
}
