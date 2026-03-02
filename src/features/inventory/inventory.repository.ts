/**
 * Inventory Repository
 *
 * @description Data access layer for inventory balances.
 */

import { db } from "@/db";
import { logger } from "@/util/logger";
import { InventoryBalancesTable } from "./inventory.model";
import { DbTransaction } from "@/types/db-transaction";
import { eq, inArray } from "drizzle-orm";

export type InventoryBalanceRow = {
  skuId: string;
  onHandQty: string;
  reservedQty: string;
};

export class InventoryRepositoryClass {
  constructor() {}

  /**
   * Get inventory balances for the given SKU IDs.
   * Returns one row per skuId; missing SKUs are not in the result (treat as 0 on hand).
   */
  async getBalancesBySkuIds(
    skuIds: string[],
    tx?: DbTransaction
  ): Promise<InventoryBalanceRow[]> {
    if (skuIds.length === 0) return [];
    try {
      const client = tx ?? db;
      const rows = await client
        .select({
          skuId: InventoryBalancesTable.skuId,
          onHandQty: InventoryBalancesTable.onHandQty,
          reservedQty: InventoryBalancesTable.reservedQty,
        })
        .from(InventoryBalancesTable)
        .where(inArray(InventoryBalancesTable.skuId, skuIds));
      return rows as InventoryBalanceRow[];
    } catch (error) {
      logger.error("❌ [InventoryRepository.getBalancesBySkuIds] Error:", error);
      throw error;
    }
  }
}
