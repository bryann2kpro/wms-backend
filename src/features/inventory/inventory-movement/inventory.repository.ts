/**
 * Inventory Movements Repository
 * 
 * @description Data access layer for Inventory Movements operations.
 */

import { db } from '@/db';
import { InventoryMovementsTable } from './inventory.model';
import { eq, and, inArray, like, asc, desc, sql } from 'drizzle-orm';
import { logger } from '@/util/logger';
import type { DbTransaction } from '@/types/db-transaction';
import { PaginationParams, PaginatedResponse } from '../../rbac/rbac.model';
import { pagination, PgQueryType } from '@/util/pagination';

export type InventoryMovementsType = typeof InventoryMovementsTable.$inferSelect;
export type InventoryMovementsInsertType = typeof InventoryMovementsTable.$inferInsert;

// ============================================
// FILTER TYPES
// ============================================

export type InventoryMovementsFilter = {
  id?: string;
  skuId?: string | string[];
  movementType?: string | string[];
  referenceNo?: string;
  reason?: string;
}
export class InventoryMovementsRepositoryClass {
    constructor() {}

      /**
   * Get Inventory Movements with optional filtering and pagination
   */
  async getInventoryMovements(
    filter: InventoryMovementsFilter,
    paginationParams: PaginationParams
  ): Promise<PaginatedResponse<any>> {
    try {
      logger.info("ℹ️ [InventoryMovementsRepository.getInventoryMovements] Getting inventory movements...");
      logger.debug("Filter:", filter);

      const whereCondition = [];

      if (Array.isArray(filter.skuId)) {
        whereCondition.push(inArray(InventoryMovementsTable.skuId, filter.skuId));
      } else if (filter.skuId) {
        whereCondition.push(eq(InventoryMovementsTable.skuId, filter.skuId));
      }

      if (Array.isArray(filter.movementType)) {
        whereCondition.push(inArray(InventoryMovementsTable.movementType, filter.movementType));
      } else if (filter.movementType) {
        whereCondition.push(eq(InventoryMovementsTable.movementType, filter.movementType));
      }

      if (filter.referenceNo) {
        whereCondition.push(like(InventoryMovementsTable.referenceNo, `%${filter.referenceNo}%`));
      }

      if (filter.reason) {
        whereCondition.push(like(InventoryMovementsTable.reason, `%${filter.reason}%`));
      }

      const baseQuery = db
        .select()
        .from(InventoryMovementsTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined)

      if (paginationParams.sortBy) {
        baseQuery.orderBy(sql`${sql.identifier(paginationParams.sortBy)} ${sql.raw(paginationParams.sortOrder || 'ASC')}`);
      }

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

      logger.info("✅ [InventoryMovementsRepository.getInventoryMovements] Inventory Movements fetched successfully");
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error("❌ [InventoryMovementsRepository.getInventoryMovements] Error:", error);
      throw error;
    }
  }

  /**
   * Get Inventory Movement by ID
   */
  async getInventoryMovementById(id: string): Promise<InventoryMovementsType | null> {
    try {
      logger.info("ℹ️ [InventoryMovementsRepository.getInventoryMovementById] Getting inventory movement by ID...");
      const [inventoryMovement] = await db
        .select()
        .from(InventoryMovementsTable)
        .where(eq(InventoryMovementsTable.id, id))
        .limit(1);

      logger.info("✅ [InventoryMovementsRepository.getInventoryMovementById] Inventory Movement fetched successfully");
      return inventoryMovement || null;
    } catch (error) {
      logger.error("❌ [InventoryMovementsRepository.getInventoryMovementById] Error:", error);
      throw error;
    }
  }
  /**
   * Create a new inventory movement
   */
  async createInventoryMovement(
    data: Omit<InventoryMovementsInsertType, "id" | "createdAt" | "updatedAt">,
    tx?: DbTransaction
  ): Promise<InventoryMovementsType> {
    try {
      const client = tx ?? db;
      logger.info("ℹ️ [InventoryMovementsRepository.createInventoryMovement] Creating inventory movement...");

      const [warehouse] = await client
        .insert(InventoryMovementsTable)
        .values(data)
        .returning();

      logger.info("✅ [InventoryMovementsRepository.createInventoryMovement] Inventory Movement created successfully");
      return warehouse;
    } catch (error) {
      logger.error("❌ [InventoryMovementsRepository.createInventoryMovement] Error:", error);
      throw error;
    }
  }

  /**
   * Delete Inventory Movement.
   */
  async deleteInventoryMovement(id: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const client = tx ?? db;
      logger.info("ℹ️ [InventoryMovementsRepository.deleteInventoryMovement] Deleting inventory movement...");

      await client
        .delete(InventoryMovementsTable)
        .where(eq(InventoryMovementsTable.id, id));

      logger.info("✅ [InventoryMovementsRepository.deleteInventoryMovement] Inventory Movement deleted successfully");
      return true;
    } catch (error) {
      logger.error("❌ [InventoryMovementsRepository.deleteInventoryMovement] Error:", error);
      throw error;
    }
  }
  
}