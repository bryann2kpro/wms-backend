/**
 * Delivery Orders Repository
 *
 * @description Data access layer for Delivery Orders and Delivery Order Items.
 */

import { db } from "@/db";
import { logger } from "@/util/logger";
import {
  DeliveryOrdersTable,
  DeliveryOrderItemsTable,
  DeliveryOrderType,
  DeliveryOrderInsertType,
  DeliveryOrderFilter,
  DeliveryOrderItemType,
  DeliveryOrderItemInsertType,
  DeliveryOrderItemFilter,
} from "./delivery-orders.model";
import { SkuTable } from "@/features/master-data/sku.model";
import { InventoryBalancesTable } from "@/features/inventory/inventory-balance/inventory.model";
import { PaginationParams, PaginatedResponse } from "@/features/rbac/rbac.model";
import { pagination, PgQueryType } from "@/util/pagination";
import { DbTransaction } from "@/types/db-transaction";
import { eq, and, like, inArray, gte, lte, or } from "drizzle-orm";

export type DeliveryOrderItemWithDetails = DeliveryOrderItemType & {
  skuCode: string | null;
  skuDescription: string | null;
  doNo: string | null;
  doStatus: string | null;
  onHandQty: string | null;
  lossQty: string | null;
  reservedQty: string | null;
};

export class DeliveryOrdersRepositoryClass {
  constructor() {}

  // ============================================
  // Delivery Orders
  // ============================================

  async getDeliveryOrders(
    filter: DeliveryOrderFilter,
    paginationParams: PaginationParams
  ): Promise<PaginatedResponse<DeliveryOrderType>> {
    try {
      logger.info("ℹ️ [DeliveryOrdersRepository.getDeliveryOrders] Getting delivery orders...");
      const whereCondition: ReturnType<typeof eq>[] = [];

      if (Array.isArray(filter.id)) {
        whereCondition.push(inArray(DeliveryOrdersTable.id, filter.id));
      } else if (filter.id) {
        whereCondition.push(eq(DeliveryOrdersTable.id, filter.id));
      }
      if (filter.doNo) {
        whereCondition.push(like(DeliveryOrdersTable.doNo, `%${filter.doNo}%`));
      }
      // if (Array.isArray(filter.purchaseOrderNo)) {
      //   whereCondition.push(inArray(DeliveryOrdersTable.purchaseOrderNo, filter.purchaseOrderNo));
      // } else if (filter.purchaseOrderNo) {
      //   whereCondition.push(eq(DeliveryOrdersTable.purchaseOrderNo, filter.purchaseOrderNo));
      // }
      if (Array.isArray(filter.status)) {
        whereCondition.push(inArray(DeliveryOrdersTable.status, filter.status));
      } else if (filter.status) {
        whereCondition.push(eq(DeliveryOrdersTable.status, filter.status));
      }
      if (filter.isEmergency !== undefined) {
        whereCondition.push(eq(DeliveryOrdersTable.isEmergency, filter.isEmergency));
      }
      if (Array.isArray(filter.createdBy)) {
        whereCondition.push(inArray(DeliveryOrdersTable.createdBy, filter.createdBy));
      } else if (filter.createdBy) {
        whereCondition.push(eq(DeliveryOrdersTable.createdBy, filter.createdBy));
      }
      if (filter.createdAtFrom) {
        whereCondition.push(gte(DeliveryOrdersTable.createdAt, new Date(filter.createdAtFrom)));
      }
      if (filter.createdAtTo) {
        whereCondition.push(lte(DeliveryOrdersTable.createdAt, new Date(filter.createdAtTo)));
      }

      const baseQuery = db
        .select()
        .from(DeliveryOrdersTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize ?? 10;
      const pageNumber = paginationParams.pageNumber ?? 1;
      const totalCount = (await baseQuery).length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info("✅ [DeliveryOrdersRepository.getDeliveryOrders] Delivery orders fetched successfully");
      return { query: data as DeliveryOrderType[], pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error("❌ [DeliveryOrdersRepository.getDeliveryOrders] Error:", error);
      throw error;
    }
  }

  async createDeliveryOrder(data: DeliveryOrderInsertType, tx?: DbTransaction): Promise<DeliveryOrderType> {
    try {
      const dbClient = tx ?? db;
      logger.info("ℹ️ [DeliveryOrdersRepository.createDeliveryOrder] Creating delivery order...");
      const [row] = await dbClient
        .insert(DeliveryOrdersTable)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      logger.info("✅ [DeliveryOrdersRepository.createDeliveryOrder] Delivery order created successfully");
      return row;
    } catch (error) {
      logger.error("❌ [DeliveryOrdersRepository.createDeliveryOrder] Error:", error);
      throw error;
    }
  }

  async updateDeliveryOrder(
    id: string,
    data: Partial<DeliveryOrderInsertType>,
    tx?: DbTransaction
  ): Promise<DeliveryOrderType> {
    try {
      const dbClient = tx ?? db;
      logger.info("ℹ️ [DeliveryOrdersRepository.updateDeliveryOrder] Updating delivery order...");
      const [row] = await dbClient
        .update(DeliveryOrdersTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(DeliveryOrdersTable.id, id))
        .returning();
      if (!row) throw new Error("[DeliveryOrdersRepository.updateDeliveryOrder] Delivery order not found");
      logger.info("✅ [DeliveryOrdersRepository.updateDeliveryOrder] Delivery order updated successfully");
      return row;
    } catch (error) {
      logger.error("❌ [DeliveryOrdersRepository.updateDeliveryOrder] Error:", error);
      throw error;
    }
  }

  async deleteDeliveryOrder(id: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx ?? db;
      await dbClient.delete(DeliveryOrdersTable).where(eq(DeliveryOrdersTable.id, id));
      logger.info("✅ [DeliveryOrdersRepository.deleteDeliveryOrder] Delivery order deleted successfully");
      return true;
    } catch (error) {
      logger.error("❌ [DeliveryOrdersRepository.deleteDeliveryOrder] Error:", error);
      throw error;
    }
  }

  // ============================================
  // Delivery Order Items
  // ============================================

  async getDeliveryOrderItems(
    filter: DeliveryOrderItemFilter,
    paginationParams: PaginationParams
  ): Promise<PaginatedResponse<DeliveryOrderItemType>> {
    try {
      logger.info("ℹ️ [DeliveryOrdersRepository.getDeliveryOrderItems] Getting delivery order items...");
      const whereCondition: ReturnType<typeof eq>[] = [];

      if (Array.isArray(filter.id)) {
        whereCondition.push(inArray(DeliveryOrderItemsTable.id, filter.id));
      } else if (filter.id) {
        whereCondition.push(eq(DeliveryOrderItemsTable.id, filter.id));
      }
      // if (Array.isArray(filter.doId)) {
      //   whereCondition.push(inArray(DeliveryOrderItemsTable.deliveryOrderNo, filter.deliveryOrderNo));
      // } else if (filter.deliveryOrderNo) {
      //   whereCondition.push(eq(DeliveryOrderItemsTable.deliveryOrderNo, filter.deliveryOrderNo));
      // }

      const baseQuery = db
        .select()
        .from(DeliveryOrderItemsTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize ?? 10;
      const pageNumber = paginationParams.pageNumber ?? 1;
      const totalCount = (await baseQuery).length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info("✅ [DeliveryOrdersRepository.getDeliveryOrderItems] Delivery order items fetched successfully");
      return { query: data as DeliveryOrderItemType[], pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error("❌ [DeliveryOrdersRepository.getDeliveryOrderItems] Error:", error);
      throw error;
    }
  }

  async createDeliveryOrderItems(
    data: DeliveryOrderItemInsertType[],
    tx?: DbTransaction
  ): Promise<DeliveryOrderItemType[]> {
    try {
      const dbClient = tx ?? db;
      logger.info("ℹ️ [DeliveryOrdersRepository.createDeliveryOrderItems] Creating delivery order items...");
      const rows = await dbClient
        .insert(DeliveryOrderItemsTable)
        .values(
          data.map((item) => ({
            ...item,
            createdAt: new Date(),
            updatedAt: new Date(),
          }))
        )
        .returning();
      logger.info("✅ [DeliveryOrdersRepository.createDeliveryOrderItems] Delivery order items created successfully");
      return rows;
    } catch (error) {
      logger.error("❌ [DeliveryOrdersRepository.createDeliveryOrderItems] Error:", error);
      throw error;
    }
  }

  async updateDeliveryOrderItem(
    id: string,
    data: Partial<DeliveryOrderItemInsertType>,
    tx?: DbTransaction
  ): Promise<DeliveryOrderItemType> {
    try {
      const dbClient = tx ?? db;
      logger.info("ℹ️ [DeliveryOrdersRepository.updateDeliveryOrderItem] Updating delivery order item...");
      const [row] = await dbClient
        .update(DeliveryOrderItemsTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(DeliveryOrderItemsTable.id, id))
        .returning();
      if (!row) throw new Error("[DeliveryOrdersRepository.updateDeliveryOrderItem] Delivery order item not found");
      logger.info("✅ [DeliveryOrdersRepository.updateDeliveryOrderItem] Delivery order item updated successfully");
      return row;
    } catch (error) {
      logger.error("❌ [DeliveryOrdersRepository.updateDeliveryOrderItem] Error:", error);
      throw error;
    }
  }

  async deleteDeliveryOrderItem(id: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx ?? db;
      await dbClient.delete(DeliveryOrderItemsTable).where(eq(DeliveryOrderItemsTable.id, id));
      logger.info("✅ [DeliveryOrdersRepository.deleteDeliveryOrderItem] Delivery order item deleted successfully");
      return true;
    } catch (error) {
      logger.error("❌ [DeliveryOrdersRepository.deleteDeliveryOrderItem] Error:", error);
      throw error;
    }
  }

  async deleteDeliveryOrderItemsByDeliveryOrderNo(deliveryOrderNo: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx ?? db;
      await dbClient.delete(DeliveryOrderItemsTable).where(eq(DeliveryOrderItemsTable.purchaseOrderNo, deliveryOrderNo));
      logger.info("✅ [DeliveryOrdersRepository.deleteDeliveryOrderItemsByDeliveryOrderNo] Delivery order items deleted successfully");
      return true;
    } catch (error) {
      logger.error("❌ [DeliveryOrdersRepository.deleteDeliveryOrderItemsByDeliveryOrderNo] Error:", error);
      throw error;
    }
  }

  /**
   * Get delivery order items with SKU details and inventory balance.
   * Joins with SKU table, delivery orders table, and inventory balances table.
   */
  async getDeliveryOrderItemsWithDetails(
    filter: DeliveryOrderItemFilter & { 
      purchaseOrderNo?: string; 
      doNo?: string;
      doStatus?: string | string[];
      search?: string;
    },
    paginationParams: PaginationParams
  ): Promise<PaginatedResponse<DeliveryOrderItemWithDetails>> {
    try {
      logger.info("ℹ️ [DeliveryOrdersRepository.getDeliveryOrderItemsWithDetails] Getting delivery order items with details...");
      const whereConditions: ReturnType<typeof eq>[] = [];

      if (Array.isArray(filter.id)) {
        whereConditions.push(inArray(DeliveryOrderItemsTable.id, filter.id));
      } else if (filter.id) {
        whereConditions.push(eq(DeliveryOrderItemsTable.id, filter.id));
      }

      if (filter.purchaseOrderNo) {
        whereConditions.push(like(DeliveryOrderItemsTable.purchaseOrderNo, `%${filter.purchaseOrderNo}%`));
      }

      if (filter.doNo) {
        whereConditions.push(like(DeliveryOrdersTable.doNo, `%${filter.doNo}%`));
      }

      if (Array.isArray(filter.doStatus)) {
        whereConditions.push(inArray(DeliveryOrdersTable.status, filter.doStatus));
      } else if (filter.doStatus) {
        whereConditions.push(eq(DeliveryOrdersTable.status, filter.doStatus));
      }

      if (filter.search) {
        const searchTerm = `%${filter.search}%`;
        whereConditions.push(
          or(
            like(SkuTable.skuCode, searchTerm),
            like(SkuTable.skuDescription, searchTerm),
            like(DeliveryOrderItemsTable.purchaseOrderNo, searchTerm),
            like(DeliveryOrdersTable.doNo, searchTerm)
          )!
        );
      }

      const baseQuery = db
        .select({
          id: DeliveryOrderItemsTable.id,
          purchaseOrderId: DeliveryOrderItemsTable.purchaseOrderId,
          purchaseOrderNo: DeliveryOrderItemsTable.purchaseOrderNo,
          skuId: DeliveryOrderItemsTable.skuId,
          qtyRequired: DeliveryOrderItemsTable.qtyRequired,
          qtyPicked: DeliveryOrderItemsTable.qtyPicked,
          qtyPacked: DeliveryOrderItemsTable.qtyPacked,
          createdAt: DeliveryOrderItemsTable.createdAt,
          updatedAt: DeliveryOrderItemsTable.updatedAt,
          createdBy: DeliveryOrderItemsTable.createdBy,
          updatedBy: DeliveryOrderItemsTable.updatedBy,
          skuCode: SkuTable.skuCode,
          skuDescription: SkuTable.skuDescription,
          doNo: DeliveryOrdersTable.doNo,
          doStatus: DeliveryOrdersTable.status,
          onHandQty: InventoryBalancesTable.onHandQty,
          lossQty: InventoryBalancesTable.lossQty,
          reservedQty: InventoryBalancesTable.reservedQty,
        })
        .from(DeliveryOrderItemsTable)
        .leftJoin(SkuTable, eq(DeliveryOrderItemsTable.skuId, SkuTable.skuId))
        .leftJoin(DeliveryOrdersTable, eq(DeliveryOrderItemsTable.purchaseOrderId, DeliveryOrdersTable.purchaseOrderId))
        .leftJoin(InventoryBalancesTable, eq(DeliveryOrderItemsTable.skuId, InventoryBalancesTable.skuId))
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

      const pageSize = paginationParams.pageSize ?? 10;
      const pageNumber = paginationParams.pageNumber ?? 1;
      const totalCount = (await baseQuery).length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info("✅ [DeliveryOrdersRepository.getDeliveryOrderItemsWithDetails] Delivery order items with details fetched successfully");
      return { query: data as DeliveryOrderItemWithDetails[], pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error("❌ [DeliveryOrdersRepository.getDeliveryOrderItemsWithDetails] Error:", error);
      throw error;
    }
  }

  /**
   * Update qtyPicked for a delivery order item (mark as picked).
   */
  async markItemAsPicked(
    id: string,
    qtyPicked: string,
    updatedBy: string,
    tx?: DbTransaction
  ): Promise<DeliveryOrderItemType> {
    try {
      const dbClient = tx ?? db;
      logger.info("ℹ️ [DeliveryOrdersRepository.markItemAsPicked] Marking item as picked...");
      const [row] = await dbClient
        .update(DeliveryOrderItemsTable)
        .set({ qtyPicked, updatedBy, updatedAt: new Date() })
        .where(eq(DeliveryOrderItemsTable.id, id))
        .returning();
      if (!row) throw new Error("[DeliveryOrdersRepository.markItemAsPicked] Delivery order item not found");
      logger.info("✅ [DeliveryOrdersRepository.markItemAsPicked] Item marked as picked successfully");
      return row;
    } catch (error) {
      logger.error("❌ [DeliveryOrdersRepository.markItemAsPicked] Error:", error);
      throw error;
    }
  }
}
