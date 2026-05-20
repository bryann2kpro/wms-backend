/**
 * Daily Opening Stock Repository
 *
 * @description Handles snapshotting and retrieval of daily opening stock records.
 */

import { db } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "@/util/logger";
import type { DbTransaction } from "@/types/db-transaction";
import { DailyOpeningStockTable } from "./daily-opening-stock.model";
import { InventoryBalancesTable } from "../inventory-balance/inventory.model";
import { SkuTable } from "@/features/master-data/sku.model";

export type DailyOpeningStockRow = {
  skuId: string;
  openingQty: string;
  openingLossQty: string;
};

export class DailyOpeningStockRepositoryClass {
  /**
   * Snapshot today's inventory balances for an organization.
   *
   * Uses INSERT ... ON CONFLICT DO NOTHING so the job is idempotent —
   * running it twice on the same day has no effect.
   */
  async snapshotToday(
    organizationId: string,
    tx?: DbTransaction
  ): Promise<void> {
    const client = tx ?? db;
    const today = new Date().toISOString().split("T")[0]; // 'YYYY-MM-DD'

    logger.info(
      `ℹ️ [DailyOpeningStockRepository.snapshotToday] Snapshotting org=${organizationId} date=${today}`
    );

    // SELECT skus joined with inventory_balances, then INSERT ... ON CONFLICT DO NOTHING
    // We use a raw insert from a subquery via Drizzle's sql helper
    await client.execute(sql`
      INSERT INTO main.daily_opening_stock
        (organization_id, record_date, sku_id, opening_qty, opening_loss_qty)
      SELECT
        ${organizationId}::uuid,
        ${today}::date,
        s.sku_id,
        COALESCE(ib.on_hand_qty, 0),
        COALESCE(ib.loss_qty, 0)
      FROM main.m_skus s
      LEFT JOIN main.inventory_balances ib ON ib.sku_id = s.sku_id
      WHERE s.organization_id = ${organizationId}::uuid
      ON CONFLICT (organization_id, record_date, sku_id) DO NOTHING
    `);

    logger.info(
      `✅ [DailyOpeningStockRepository.snapshotToday] Snapshot complete for org=${organizationId} date=${today}`
    );
  }

  /**
   * Retrieve opening stock for all SKUs in an organization for a given date.
   *
   * Returns a map keyed by skuId for O(1) lookup at session creation.
   */
  async getOpeningForSession(
    organizationId: string,
    date: Date
  ): Promise<Map<string, { openingQty: string; openingLossQty: string }>> {
    const dateStr = date.toISOString().split("T")[0];

    const rows = await db
      .select({
        skuId: DailyOpeningStockTable.skuId,
        openingQty: DailyOpeningStockTable.openingQty,
        openingLossQty: DailyOpeningStockTable.openingLossQty,
      })
      .from(DailyOpeningStockTable)
      .where(
        and(
          eq(DailyOpeningStockTable.organizationId, organizationId),
          eq(DailyOpeningStockTable.recordDate, dateStr)
        )
      );

    const map = new Map<
      string,
      { openingQty: string; openingLossQty: string }
    >();
    for (const row of rows) {
      map.set(row.skuId as string, {
        openingQty: row.openingQty ?? "0",
        openingLossQty: row.openingLossQty ?? "0",
      });
    }

    return map;
  }
}
