/**
 * Inventory Movements Repository
 * 
 * @description Data access layer for Inventory Movements operations.
 */

import { db } from '@/db';
import { InventoryMovementsTable, InventoryMovementType } from './inventory.model';
import { eq, and, inArray, like, asc, desc, sql } from 'drizzle-orm';
import { logger } from '@/util/logger';
import type { DbTransaction } from '@/types/db-transaction';
import { PaginationParams, PaginatedResponse } from '../../rbac/rbac.model';
import { pagination, PgQueryType } from '@/util/pagination';
import { InventoryBalanceRepositoryClass } from '../inventory-balance/inventory.repository';

export type InventoryMovementsType = typeof InventoryMovementsTable.$inferSelect;
export type InventoryMovementsInsertType = typeof InventoryMovementsTable.$inferInsert;

// ============================================
// FILTER TYPES
// ============================================

export type InventoryMovementsFilter = {
  id?: string;
  skuId?: string | string[];
  movementType?: InventoryMovementType | InventoryMovementType[];
  referenceNo?: string;
  reason?: string;
}
export class InventoryMovementRepositoryClass {
    constructor(
      private readonly inventoryBalanceRepository: InventoryBalanceRepositoryClass
    ) {}

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
    data: InventoryMovementsInsertType,
    tx?: DbTransaction
  ): Promise<InventoryMovementsType> {
    try {
      const client = tx ?? db;
      logger.info("ℹ️ [InventoryMovementsRepository.createInventoryMovement] Creating inventory movement...");

      const [existingBalance] =
        (await this.inventoryBalanceRepository.getInventoryBalanceBySkuIds([data.skuId as string])) ?? [];

      const currentOnHand = Number(existingBalance?.onHandQty ?? "0");
      const currentLoss = Number(existingBalance?.lossQty ?? "0");
      const currentReserved = Number(existingBalance?.reservedQty ?? "0");
      const quantity = Number(data.quantity ?? "0");

      let newOnHand = currentOnHand;
      let newLoss = currentLoss;
      let newReserved = currentReserved;

      switch (data.movementType) {
        case InventoryMovementType.INBOUND:
          newOnHand += quantity;
          break;
        case InventoryMovementType.RESERVED:
          newReserved += quantity;
          break;
        case InventoryMovementType.SHIPMENT:
          newReserved -= quantity;
          newOnHand -= quantity;
          break;  
        case InventoryMovementType.ADJUSTMENT:
          newOnHand += quantity;
          break;
        case InventoryMovementType.DAMAGED:
          newOnHand -= quantity;
          newLoss += quantity;
          break;
      }

      const balanceAfter = newOnHand;

      await this.inventoryBalanceRepository.upsertInventoryBalance({
        skuId: data.skuId,
        onHandQty: newOnHand.toString(),
        lossQty: newLoss.toString(),
        reservedQty: newReserved.toString(),
        updatedAt: new Date(),
      });

      const [inventoryMovement] = await client
        .insert(InventoryMovementsTable)
        .values({
          ...data,
          balanceAfter: balanceAfter.toString(),
        })
        .returning();

      logger.info("✅ [InventoryMovementsRepository.createInventoryMovement] Inventory Movement created successfully");
      return inventoryMovement;
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