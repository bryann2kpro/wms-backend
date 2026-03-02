/**
 * Transfer Orders Repository
 *
 * @description Data access layer for Transfer Orders and Transfer Order Items.
 */

import { db } from "@/db";
import { logger } from "@/util/logger";
import {
  PurchaseOrdersTable,
  PurchaseOrderItemsTable,
  PurchaseOrderType,
  PurchaseOrderInsertType,
  PurchaseOrderFilter,
  PurchaseOrderItemType,
  PurchaseOrderItemInsertType,
  PurchaseOrderItemFilter,
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
    filter: PurchaseOrderFilter,
    paginationParams: PaginationParams
  ): Promise<PaginatedResponse<PurchaseOrderType>> {
    try {
      logger.info("ℹ️ [TransferOrdersRepository.getTransferOrders] Getting transfer orders...");
      const whereCondition: ReturnType<typeof eq>[] = [];

      if (Array.isArray(filter.id)) {
        whereCondition.push(inArray(PurchaseOrdersTable.id, filter.id));
      } else if (filter.id) {
        whereCondition.push(eq(PurchaseOrdersTable.id, filter.id));
      }
      if (filter.purchaseOrderNo) {
        whereCondition.push(like(PurchaseOrdersTable.purchaseOrderNo, `%${filter.purchaseOrderNo}%`));
      }
      if (Array.isArray(filter.outletId)) {
        whereCondition.push(inArray(PurchaseOrdersTable.outletId, filter.outletId));
      } else if (filter.outletId) {
        whereCondition.push(eq(PurchaseOrdersTable.outletId, filter.outletId));
      }
      if (Array.isArray(filter.status)) {
        whereCondition.push(inArray(PurchaseOrdersTable.status, filter.status));
      } else if (filter.status) {
        whereCondition.push(eq(PurchaseOrdersTable.status, filter.status));
      }
      if (filter.scheduledDeliveryDateFrom) {
        whereCondition.push(gte(PurchaseOrdersTable.scheduledDeliveryDate, new Date(filter.scheduledDeliveryDateFrom)));
      }
      if (filter.scheduledDeliveryDateTo) {
        whereCondition.push(lte(PurchaseOrdersTable.scheduledDeliveryDate, new Date(filter.scheduledDeliveryDateTo)));
      }
      if (filter.createdAtFrom) {
        whereCondition.push(gte(PurchaseOrdersTable.createdAt, new Date(filter.createdAtFrom)));
      }
      if (filter.createdAtTo) {
        whereCondition.push(lte(PurchaseOrdersTable.createdAt, new Date(filter.createdAtTo)));
      }

      const baseQuery = db
        .select()
        .from(PurchaseOrdersTable)
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

  async createTransferOrder(data: PurchaseOrderInsertType, tx?: DbTransaction): Promise<PurchaseOrderType> {
    try {
      const dbClient = tx ?? db;
      logger.info("ℹ️ [TransferOrdersRepository.createTransferOrder] Creating transfer order...");
      const [row] = await dbClient
        .insert(PurchaseOrdersTable)
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
    data: Partial<PurchaseOrderInsertType>,
    tx?: DbTransaction
  ): Promise<PurchaseOrderType> {
    try {
      const dbClient = tx ?? db;
      logger.info("ℹ️ [TransferOrdersRepository.updateTransferOrder] Updating transfer order...");
      const [row] = await dbClient
        .update(PurchaseOrdersTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(PurchaseOrdersTable.id, id))
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
      await dbClient.delete(PurchaseOrdersTable).where(eq(PurchaseOrdersTable.id, id));
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
    filter: PurchaseOrderItemFilter,
    paginationParams: PaginationParams
  ): Promise<PaginatedResponse<PurchaseOrderItemType>> {
    try {
      logger.info("ℹ️ [TransferOrdersRepository.getTransferOrderItems] Getting transfer order items...");
      const whereCondition: ReturnType<typeof eq>[] = [];

      if (Array.isArray(filter.id)) {
        whereCondition.push(inArray(PurchaseOrderItemsTable.id, filter.id));
      } else if (filter.id) {
        whereCondition.push(eq(PurchaseOrderItemsTable.id, filter.id));
      }
      if (Array.isArray(filter.purchaseOrderNo)) {
        whereCondition.push(inArray(PurchaseOrderItemsTable.purchaseOrderNo, filter.purchaseOrderNo));
      } else if (filter.purchaseOrderNo) {
        whereCondition.push(eq(PurchaseOrderItemsTable.purchaseOrderNo, filter.purchaseOrderNo));
      }
      if (Array.isArray(filter.skuCode)) {
        whereCondition.push(inArray(PurchaseOrderItemsTable.skuCode, filter.skuCode));
      } else if (filter.skuCode) {
        whereCondition.push(eq(PurchaseOrderItemsTable.skuCode, filter.skuCode));
      }

      const baseQuery = db
        .select()
        .from(PurchaseOrderItemsTable)
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
    data: PurchaseOrderItemInsertType[],
    tx?: DbTransaction
  ): Promise<PurchaseOrderItemType[]> {
    try {
      const dbClient = tx ?? db;
      logger.info("ℹ️ [TransferOrdersRepository.createTransferOrderItems] Creating transfer order items...");
      const rows = await dbClient
        .insert(PurchaseOrderItemsTable)
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
    data: Partial<PurchaseOrderItemInsertType>,
    tx?: DbTransaction
  ): Promise<PurchaseOrderItemType> {
    try {
      const dbClient = tx ?? db;
      logger.info("ℹ️ [TransferOrdersRepository.updateTransferOrderItem] Updating transfer order item...");
      const [row] = await dbClient
        .update(PurchaseOrderItemsTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(PurchaseOrderItemsTable.id, id))
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
      await dbClient.delete(PurchaseOrderItemsTable).where(eq(PurchaseOrderItemsTable.id, id));
      logger.info("✅ [TransferOrdersRepository.deleteTransferOrderItem] Transfer order item deleted successfully");
      return true;
    } catch (error) {
      logger.error("❌ [TransferOrdersRepository.deleteTransferOrderItem] Error:", error);
      throw error;
    }
  }

  async deleteTransferOrderItemsByPurchaseOrderNo(purchaseOrderNo: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx ?? db;
      await dbClient.delete(PurchaseOrderItemsTable).where(eq(PurchaseOrderItemsTable.purchaseOrderNo, purchaseOrderNo));
      logger.info("✅ [TransferOrdersRepository.deleteTransferOrderItemsByPurchaseOrderNo] Transfer order items deleted successfully");
      return true;
    } catch (error) {
      logger.error("❌ [TransferOrdersRepository.deleteTransferOrderItemsByPurchaseOrderNo] Error:", error);
      throw error;
    }
  }
}
