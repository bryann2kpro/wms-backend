/**
 * Transfer Orders Repository
 *
 * @description Data access layer for Transfer Orders and Transfer Order Items.
 */

import { db } from "@/db";
import { logger } from "@/util/logger";
import {
  TransferOrdersTable,
  TransferOrderItemsTable,
  TransferOrderType,
  TransferOrderInsertType,
  TransferOrderFilter,
  TransferOrderItemType,
  TransferOrderItemInsertType,
  TransferOrderItemFilter,
} from "./transfer-orders.model";
import { PaginationParams, PaginatedResponse } from "@/features/rbac/rbac.model";
import { pagination, PgQueryType } from "@/util/pagination";
import { DbTransaction } from "@/types/db-transaction";
import { eq, and, like, inArray, gte, lte } from "drizzle-orm";

export class TransferOrdersRepositoryClass {
  constructor() {}

  // ============================================
  // Transfer Orders
  // ============================================

  async getTransferOrders(
    filter: TransferOrderFilter,
    paginationParams: PaginationParams
  ): Promise<PaginatedResponse<TransferOrderType>> {
    try {
      logger.info("ℹ️ [TransferOrdersRepository.getTransferOrders] Getting transfer orders...");
      const whereCondition: ReturnType<typeof eq>[] = [];

      if (Array.isArray(filter.id)) {
        whereCondition.push(inArray(TransferOrdersTable.id, filter.id));
      } else if (filter.id) {
        whereCondition.push(eq(TransferOrdersTable.id, filter.id));
      }
      if (filter.netsuiteToId) {
        whereCondition.push(eq(TransferOrdersTable.netsuiteToId, filter.netsuiteToId));
      }
      if (filter.toNo) {
        whereCondition.push(like(TransferOrdersTable.toNo, `%${filter.toNo}%`));
      }
      if (Array.isArray(filter.outletId)) {
        whereCondition.push(inArray(TransferOrdersTable.outletId, filter.outletId));
      } else if (filter.outletId) {
        whereCondition.push(eq(TransferOrdersTable.outletId, filter.outletId));
      }
      if (Array.isArray(filter.status)) {
        whereCondition.push(inArray(TransferOrdersTable.status, filter.status));
      } else if (filter.status) {
        whereCondition.push(eq(TransferOrdersTable.status, filter.status));
      }
      if (filter.requestedDeliveryDateFrom) {
        whereCondition.push(gte(TransferOrdersTable.requestedDeliveryDate, new Date(filter.requestedDeliveryDateFrom)));
      }
      if (filter.requestedDeliveryDateTo) {
        whereCondition.push(lte(TransferOrdersTable.requestedDeliveryDate, new Date(filter.requestedDeliveryDateTo)));
      }
      if (filter.scheduledDeliveryDateFrom) {
        whereCondition.push(gte(TransferOrdersTable.scheduledDeliveryDate, new Date(filter.scheduledDeliveryDateFrom)));
      }
      if (filter.scheduledDeliveryDateTo) {
        whereCondition.push(lte(TransferOrdersTable.scheduledDeliveryDate, new Date(filter.scheduledDeliveryDateTo)));
      }
      if (filter.createdAtFrom) {
        whereCondition.push(gte(TransferOrdersTable.createdAt, new Date(filter.createdAtFrom)));
      }
      if (filter.createdAtTo) {
        whereCondition.push(lte(TransferOrdersTable.createdAt, new Date(filter.createdAtTo)));
      }

      const baseQuery = db
        .select()
        .from(TransferOrdersTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize ?? 10;
      const pageNumber = paginationParams.pageNumber ?? 1;
      const totalCount = (await baseQuery).length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info("✅ [TransferOrdersRepository.getTransferOrders] Transfer orders fetched successfully");
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error("❌ [TransferOrdersRepository.getTransferOrders] Error:", error);
      throw error;
    }
  }

  async createTransferOrder(data: TransferOrderInsertType, tx?: DbTransaction): Promise<TransferOrderType> {
    try {
      const dbClient = tx ?? db;
      logger.info("ℹ️ [TransferOrdersRepository.createTransferOrder] Creating transfer order...");
      const [row] = await dbClient
        .insert(TransferOrdersTable)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      logger.info("✅ [TransferOrdersRepository.createTransferOrder] Transfer order created successfully");
      return row;
    } catch (error) {
      logger.error("❌ [TransferOrdersRepository.createTransferOrder] Error:", error);
      throw error;
    }
  }

  async updateTransferOrder(
    id: string,
    data: Partial<TransferOrderInsertType>,
    tx?: DbTransaction
  ): Promise<TransferOrderType> {
    try {
      const dbClient = tx ?? db;
      logger.info("ℹ️ [TransferOrdersRepository.updateTransferOrder] Updating transfer order...");
      const [row] = await dbClient
        .update(TransferOrdersTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(TransferOrdersTable.id, id))
        .returning();
      if (!row) throw new Error("[TransferOrdersRepository.updateTransferOrder] Transfer order not found");
      logger.info("✅ [TransferOrdersRepository.updateTransferOrder] Transfer order updated successfully");
      return row;
    } catch (error) {
      logger.error("❌ [TransferOrdersRepository.updateTransferOrder] Error:", error);
      throw error;
    }
  }

  async deleteTransferOrder(id: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx ?? db;
      await dbClient.delete(TransferOrdersTable).where(eq(TransferOrdersTable.id, id));
      logger.info("✅ [TransferOrdersRepository.deleteTransferOrder] Transfer order deleted successfully");
      return true;
    } catch (error) {
      logger.error("❌ [TransferOrdersRepository.deleteTransferOrder] Error:", error);
      throw error;
    }
  }

  // ============================================
  // Transfer Order Items
  // ============================================

  async getTransferOrderItems(
    filter: TransferOrderItemFilter,
    paginationParams: PaginationParams
  ): Promise<PaginatedResponse<TransferOrderItemType>> {
    try {
      logger.info("ℹ️ [TransferOrdersRepository.getTransferOrderItems] Getting transfer order items...");
      const whereCondition: ReturnType<typeof eq>[] = [];

      if (Array.isArray(filter.id)) {
        whereCondition.push(inArray(TransferOrderItemsTable.id, filter.id));
      } else if (filter.id) {
        whereCondition.push(eq(TransferOrderItemsTable.id, filter.id));
      }
      if (Array.isArray(filter.toId)) {
        whereCondition.push(inArray(TransferOrderItemsTable.toId, filter.toId));
      } else if (filter.toId) {
        whereCondition.push(eq(TransferOrderItemsTable.toId, filter.toId));
      }
      if (Array.isArray(filter.skuId)) {
        whereCondition.push(inArray(TransferOrderItemsTable.skuId, filter.skuId));
      } else if (filter.skuId) {
        whereCondition.push(eq(TransferOrderItemsTable.skuId, filter.skuId));
      }

      const baseQuery = db
        .select()
        .from(TransferOrderItemsTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize ?? 10;
      const pageNumber = paginationParams.pageNumber ?? 1;
      const totalCount = (await baseQuery).length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info("✅ [TransferOrdersRepository.getTransferOrderItems] Transfer order items fetched successfully");
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error("❌ [TransferOrdersRepository.getTransferOrderItems] Error:", error);
      throw error;
    }
  }

  async createTransferOrderItems(
    data: TransferOrderItemInsertType[],
    tx?: DbTransaction
  ): Promise<TransferOrderItemType[]> {
    try {
      const dbClient = tx ?? db;
      logger.info("ℹ️ [TransferOrdersRepository.createTransferOrderItems] Creating transfer order items...");
      const rows = await dbClient
        .insert(TransferOrderItemsTable)
        .values(
          data.map((item) => ({
            ...item,
            createdAt: new Date(),
            updatedAt: new Date(),
          }))
        )
        .returning();
      logger.info("✅ [TransferOrdersRepository.createTransferOrderItems] Transfer order items created successfully");
      return rows;
    } catch (error) {
      logger.error("❌ [TransferOrdersRepository.createTransferOrderItems] Error:", error);
      throw error;
    }
  }

  async updateTransferOrderItem(
    id: string,
    data: Partial<TransferOrderItemInsertType>,
    tx?: DbTransaction
  ): Promise<TransferOrderItemType> {
    try {
      const dbClient = tx ?? db;
      logger.info("ℹ️ [TransferOrdersRepository.updateTransferOrderItem] Updating transfer order item...");
      const [row] = await dbClient
        .update(TransferOrderItemsTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(TransferOrderItemsTable.id, id))
        .returning();
      if (!row) throw new Error("[TransferOrdersRepository.updateTransferOrderItem] Transfer order item not found");
      logger.info("✅ [TransferOrdersRepository.updateTransferOrderItem] Transfer order item updated successfully");
      return row;
    } catch (error) {
      logger.error("❌ [TransferOrdersRepository.updateTransferOrderItem] Error:", error);
      throw error;
    }
  }

  async deleteTransferOrderItem(id: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx ?? db;
      await dbClient.delete(TransferOrderItemsTable).where(eq(TransferOrderItemsTable.id, id));
      logger.info("✅ [TransferOrdersRepository.deleteTransferOrderItem] Transfer order item deleted successfully");
      return true;
    } catch (error) {
      logger.error("❌ [TransferOrdersRepository.deleteTransferOrderItem] Error:", error);
      throw error;
    }
  }

  async deleteTransferOrderItemsByToId(toId: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx ?? db;
      await dbClient.delete(TransferOrderItemsTable).where(eq(TransferOrderItemsTable.toId, toId));
      logger.info("✅ [TransferOrdersRepository.deleteTransferOrderItemsByToId] Transfer order items deleted successfully");
      return true;
    } catch (error) {
      logger.error("❌ [TransferOrdersRepository.deleteTransferOrderItemsByToId] Error:", error);
      throw error;
    }
  }
}
