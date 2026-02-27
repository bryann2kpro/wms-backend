/**
 * Warehouses Repository
 *
 * @description Data access layer for Warehouse operations.
 */

import { db } from "@/db";
import { WarehousesTable, WarehouseType, WarehouseInsertType } from "./warehouses.model";
import { logger } from "@/util/logger";
import type { DbTransaction } from "@/types/db-transaction";

export type WarehouseFilter = {
  warehouseId?: string | string[];
  warehouseCode?: string | string[];
  warehouseName?: string;
};

export class WarehousesRepositoryClass {
  constructor() {}

  /**
   * Create a new warehouse
   */
  async createWarehouse(
    data: Omit<WarehouseInsertType, "warehouseId" | "createdAt" | "updatedAt">,
    tx?: DbTransaction
  ): Promise<WarehouseType> {
    try {
      const client = tx ?? db;
      logger.info("ℹ️ [WarehousesRepository.createWarehouse] Creating warehouse...");

      const [warehouse] = await client
        .insert(WarehousesTable)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      logger.info("✅ [WarehousesRepository.createWarehouse] Warehouse created successfully");
      return warehouse;
    } catch (error) {
      logger.error("❌ [WarehousesRepository.createWarehouse] Error:", error);
      throw error;
    }
  }
}

