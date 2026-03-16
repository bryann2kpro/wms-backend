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
   * @param filter - Filter options
   * @param paginationParams - Pagination parameters
   * @param organizationId - Organization ID for multi-tenant filtering
   */
  async getWarehouse(
    filter: WarehouseFilter,
    paginationParams: PaginationParams,
    organizationId?: string
  ): Promise<PaginatedResponse<any>> {
    try {
      logger.info("ℹ️ [WarehousesRepository.getWarehouse] Getting warehouses...");
      logger.debug("Filter:", filter);

      const whereCondition = [];

      if (organizationId) {
        whereCondition.push(eq(WarehousesTable.organizationId, organizationId));
      }

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
   * @param id - Warehouse ID
   * @param organizationId - Organization ID for multi-tenant filtering
   */
  async getWarehouseById(id: string, organizationId?: string): Promise<WarehouseType | null> {
    try {
      logger.info("ℹ️ [WarehousesRepository.getWarehouseById] Getting warehouse by ID...");
      const whereConditions = [eq(WarehousesTable.warehouseId, id)];
      if (organizationId) {
        whereConditions.push(eq(WarehousesTable.organizationId, organizationId));
      }
      const [warehouse] = await db
        .select()
        .from(WarehousesTable)
        .where(and(...whereConditions))
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
   * @param id - Warehouse ID
   * @param data - Partial warehouse data
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   */
  async updateWarehouse(
    id: string,
    data: Partial<WarehouseInsertType>,
    organizationId?: string,
    tx?: DbTransaction
  ): Promise<WarehouseType | null> {
    try {
      const client = tx ?? db;
      logger.info("ℹ️ [WarehousesRepository.updateWarehouse] Updating warehouse...");
      const whereConditions = [eq(WarehousesTable.warehouseId, id)];
      if (organizationId) {
        whereConditions.push(eq(WarehousesTable.organizationId, organizationId));
      }

      const [warehouse] = await client
        .update(WarehousesTable)
        .set({ ...data, updatedAt: new Date() })
        .where(and(...whereConditions))
        .returning();

      logger.info("✅ [WarehousesRepository.updateWarehouse] Warehouse updated successfully");
      return warehouse || null;
    } catch (error) {
      logger.error("❌ [WarehousesRepository.updateWarehouse] Error:", error);
      throw error;
    }
  }

  /**
   * Delete a warehouse
   * @param id - Warehouse ID
   * @param organizationId - Organization ID for multi-tenant filtering
   * @param tx - Optional transaction
   */
  async deleteWarehouse(id: string, organizationId?: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const client = tx ?? db;
      logger.info("ℹ️ [WarehousesRepository.deleteWarehouse] Deleting warehouse...");
      const whereConditions = [eq(WarehousesTable.warehouseId, id)];
      if (organizationId) {
        whereConditions.push(eq(WarehousesTable.organizationId, organizationId));
      }

      await client
        .delete(WarehousesTable)
        .where(and(...whereConditions));

      logger.info("✅ [WarehousesRepository.deleteWarehouse] Warehouse deleted successfully");
      return true;
    } catch (error) {
      logger.error("❌ [WarehousesRepository.deleteWarehouse] Error:", error);
      throw error;
    }
  }

  /**
   * Get or create a warehouse by code (for initialization scripts)
   */
  async getOrCreateWarehouseByCode(
    warehouseCode: string,
    warehouseName: string,
    warehouseAddress: string
  ): Promise<WarehouseType> {
    try {
      logger.info("ℹ️ [WarehousesRepository.getOrCreateWarehouseByCode] Ensuring warehouse exists...");

      const existing = await db
        .select()
        .from(WarehousesTable)
        .where(eq(WarehousesTable.warehouseCode, warehouseCode))
        .limit(1);

      if (existing.length > 0) {
        logger.info(
          `✓ Warehouse "${warehouseName}" (${warehouseCode}) already exists`
        );
        return existing[0];
      }

      const [warehouse] = await db
        .insert(WarehousesTable)
        .values({
          warehouseCode,
          warehouseName,
          warehouseAddress,
          createdBy: "system",
          updatedBy: "system",
        })
        .returning();

      logger.info(
        `✅ Warehouse "${warehouseName}" (${warehouseCode}) created successfully`
      );
      return warehouse;
    } catch (error) {
      logger.error(
        "❌ [WarehousesRepository.getOrCreateWarehouseByCode] Error:",
        error
      );
      throw error;
    }
  }
}

