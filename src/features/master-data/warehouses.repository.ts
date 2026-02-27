/**
 * Warehouses Repository
 *
 * @description Data access layer for Warehouse operations.
 */

import { db } from "@/db";
import { WarehousesTable, WarehouseType, WarehouseInsertType } from "./warehouses.model";
import { logger } from "@/util/logger";
import type { DbTransaction } from "@/types/db-transaction";
import { eq, and, like, inArray } from "drizzle-orm";
import { pagination, PgQueryType } from "@/util/pagination";
import { PaginationParams, PaginatedResponse } from "@/features/rbac/rbac.model";

export type WarehouseFilter = {
  warehouseId?: string | string[];
  warehouseCode?: string | string[];
  warehouseName?: string;
};

export class WarehousesRepositoryClass {
  constructor() {}

  /**
   * Get warehouses with optional filtering and pagination
   */
  async getWarehouse(
    filter: WarehouseFilter,
    paginationParams: PaginationParams
  ): Promise<PaginatedResponse<any>> {
    try {
      logger.info("ℹ️ [WarehousesRepository.getWarehouse] Getting warehouses...");
      logger.debug("Filter:", filter);

      const whereCondition = [];

      if (Array.isArray(filter.warehouseId)) {
        whereCondition.push(inArray(WarehousesTable.warehouseId, filter.warehouseId));
      } else if (filter.warehouseId) {
        whereCondition.push(eq(WarehousesTable.warehouseId, filter.warehouseId));
      }

      if (Array.isArray(filter.warehouseCode)) {
        whereCondition.push(inArray(WarehousesTable.warehouseCode, filter.warehouseCode));
      } else if (filter.warehouseCode) {
        whereCondition.push(eq(WarehousesTable.warehouseCode, filter.warehouseCode));
      }

      if (filter.warehouseName) {
        whereCondition.push(like(WarehousesTable.warehouseName, `%${filter.warehouseName}%`));
      }

      const baseQuery = db
        .select()
        .from(WarehousesTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const allData = await baseQuery;
      const totalCount = allData.length;
      const paginatedQuery = pagination(
        baseQuery as unknown as PgQueryType,
        pageSize,
        pageNumber,
        totalCount
      );
      const data = await paginatedQuery.query;

      logger.info("✅ [WarehousesRepository.getWarehouse] Warehouses fetched successfully");
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error("❌ [WarehousesRepository.getWarehouse] Error:", error);
      throw error;
    }
  }

  /**
   * Get warehouse by ID
   */
  async getWarehouseById(id: string): Promise<WarehouseType | null> {
    try {
      logger.info("ℹ️ [WarehousesRepository.getWarehouseById] Getting warehouse by ID...");
      const [warehouse] = await db
        .select()
        .from(WarehousesTable)
        .where(eq(WarehousesTable.warehouseId, id))
        .limit(1);

      logger.info("✅ [WarehousesRepository.getWarehouseById] Warehouse fetched successfully");
      return warehouse || null;
    } catch (error) {
      logger.error("❌ [WarehousesRepository.getWarehouseById] Error:", error);
      throw error;
    }
  }

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

  /**
   * Update an existing warehouse
   */
  async updateWarehouse(
    id: string,
    data: Partial<WarehouseInsertType>,
    tx?: DbTransaction
  ): Promise<WarehouseType | null> {
    try {
      const client = tx ?? db;
      logger.info("ℹ️ [WarehousesRepository.updateWarehouse] Updating warehouse...");

      const [warehouse] = await client
        .update(WarehousesTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(WarehousesTable.warehouseId, id))
        .returning();

      logger.info("✅ [WarehousesRepository.updateWarehouse] Warehouse updated successfully");
      return warehouse || null;
    } catch (error) {
      logger.error("❌ [WarehousesRepository.updateWarehouse] Error:", error);
      throw error;
    }
  }
}

