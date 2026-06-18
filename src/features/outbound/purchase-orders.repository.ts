/**
 * Purchase Orders Repository
 *
 * @description Data access layer for Purchase Orders and Purchase Order Items.
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
} from "./purchase-orders.model";
import { PaginationParams, PaginatedResponse } from "@/features/rbac/rbac.model";
import { pagination, PgQueryType } from "@/util/pagination";
import { DbTransaction } from "@/types/db-transaction";
import { eq, and, like, inArray, gte, lte, sql, notInArray, ne } from "drizzle-orm";
import { SkuTable } from "@/features/master-data/sku.model";

export class PurchaseOrdersRepositoryClass {
  constructor() {}

  // ============================================
  // Purchase Orders
  // ============================================

  async getPurchaseOrders(
    filter: PurchaseOrderFilter,
    paginationParams: PaginationParams,
    organizationId?: string
  ): Promise<PaginatedResponse<PurchaseOrderType>> {
    try {
      logger.info("ℹ️ [PurchaseOrdersRepository.getPurchaseOrders] Getting purchase orders...");
      const whereCondition: ReturnType<typeof eq>[] = [];

      if (organizationId) {
        whereCondition.push(eq(PurchaseOrdersTable.organizationId, organizationId));
      }

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

      // logger.info("✅ [PurchaseOrdersRepository.getPurchaseOrders] Purchase orders fetched successfully");
      return { query: data as PurchaseOrderType[], pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error("❌ [PurchaseOrdersRepository.getPurchaseOrders] Error:", error);
      throw error;
    }
  }

  /**
   * Returns all purchase orders whose scheduledDeliveryDate falls within [fromDate, toDate] (inclusive).
   * No pagination; used for week view grouped by date.
   */
  async getPurchaseOrdersByScheduledDateRange(
    fromDate: Date,
    toDate: Date,
    filter?: Partial<PurchaseOrderFilter>,
    organizationId?: string
  ): Promise<PurchaseOrderType[]> {
    try {
      logger.info("ℹ️ [PurchaseOrdersRepository.getPurchaseOrdersByScheduledDateRange] Getting POs by date range...");
      const whereCondition: ReturnType<typeof eq>[] = [
        gte(PurchaseOrdersTable.scheduledDeliveryDate, fromDate),
        lte(PurchaseOrdersTable.scheduledDeliveryDate, toDate),
      ];

      if (organizationId) {
        whereCondition.push(eq(PurchaseOrdersTable.organizationId, organizationId));
      }

      if (filter) {
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
      }

      const data = await db
        .select()
        .from(PurchaseOrdersTable)
        .where(and(...whereCondition));

      logger.info("✅ [PurchaseOrdersRepository.getPurchaseOrdersByScheduledDateRange] Fetched successfully");
      return data;
    } catch (error) {
      logger.error("❌ [PurchaseOrdersRepository.getPurchaseOrdersByScheduledDateRange] Error:", error);
      throw error;
    }
  }

  async createPurchaseOrder(data: PurchaseOrderInsertType & { organizationId: string }, tx?: DbTransaction): Promise<PurchaseOrderType> {
    try {
      const dbClient = tx ?? db;
      logger.info("ℹ️ [PurchaseOrdersRepository.createPurchaseOrder] Creating purchase order...");
      const [row] = await dbClient
        .insert(PurchaseOrdersTable)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      logger.info("✅ [PurchaseOrdersRepository.createPurchaseOrder] Purchase order created successfully");
      return row;
    } catch (error) {
      logger.error("❌ [PurchaseOrdersRepository.createPurchaseOrder] Error:", error);
      throw error;
    }
  }

  async updatePurchaseOrder(
    id: string,
    data: Partial<PurchaseOrderInsertType>,
    organizationId?: string,
    tx?: DbTransaction
  ): Promise<PurchaseOrderType> {
    try {
      const dbClient = tx ?? db;
      logger.info("ℹ️ [PurchaseOrdersRepository.updatePurchaseOrder] Updating purchase order...");
      const whereConditions = [eq(PurchaseOrdersTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(PurchaseOrdersTable.organizationId, organizationId));
      }
      const [row] = await dbClient
        .update(PurchaseOrdersTable)
        .set({ ...data, updatedAt: new Date() })
        .where(and(...whereConditions))
        .returning();
      if (!row) throw new Error("[PurchaseOrdersRepository.updatePurchaseOrder] Purchase order not found");
      logger.info("✅ [PurchaseOrdersRepository.updatePurchaseOrder] Purchase order updated successfully");
      return row;
    } catch (error) {
      logger.error("❌ [PurchaseOrdersRepository.updatePurchaseOrder] Error:", error);
      throw error;
    }
  }

  async deletePurchaseOrder(id: string, organizationId?: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx ?? db;
      const whereConditions = [eq(PurchaseOrdersTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(PurchaseOrdersTable.organizationId, organizationId));
      }
      await dbClient.delete(PurchaseOrdersTable).where(and(...whereConditions));
      logger.info("✅ [PurchaseOrdersRepository.deletePurchaseOrder] Purchase order deleted successfully");
      return true;
    } catch (error) {
      logger.error("❌ [PurchaseOrdersRepository.deletePurchaseOrder] Error:", error);
      throw error;
    }
  }

  // ============================================
  // Purchase Order Items
  // ============================================

  async getPurchaseOrderItems(
    filter: PurchaseOrderItemFilter,
    paginationParams: PaginationParams
  ): Promise<PaginatedResponse<PurchaseOrderItemType>> {
    try {
      // logger.info("ℹ️ [PurchaseOrdersRepository.getPurchaseOrderItems] Getting purchase order items...");
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
        .select({
          id: PurchaseOrderItemsTable.id,
          purchaseOrderNo: PurchaseOrderItemsTable.purchaseOrderNo,
          skuCode: PurchaseOrderItemsTable.skuCode,
          qtyRequired: PurchaseOrderItemsTable.qtyRequired,
          createdAt: PurchaseOrderItemsTable.createdAt,
          updatedAt: PurchaseOrderItemsTable.updatedAt,
          createdBy: PurchaseOrderItemsTable.createdBy,
          updatedBy: PurchaseOrderItemsTable.updatedBy,
          // Correlated subquery to get one description per skuCode, avoiding row multiplication
          // that would occur if SkuTable has multiple records with the same skuCode.
          skuDescription: sql<string | null>`(SELECT sku_description FROM ${SkuTable} WHERE sku_code = ${PurchaseOrderItemsTable.skuCode} LIMIT 1)`,
        })
        .from(PurchaseOrderItemsTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize ?? 10;
      const pageNumber = paginationParams.pageNumber ?? 1;
      const totalCount = (await baseQuery).length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      // logger.info("✅ [PurchaseOrdersRepository.getPurchaseOrderItems] Purchase order items fetched successfully");
      return { query: data as (PurchaseOrderItemType & { skuDescription: string | null })[], pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error("❌ [PurchaseOrdersRepository.getPurchaseOrderItems] Error:", error);
      throw error;
    }
  }

  async createPurchaseOrderItems(
    data: PurchaseOrderItemInsertType[],
    tx?: DbTransaction
  ): Promise<PurchaseOrderItemType[]> {
    try {
      const dbClient = tx ?? db;
      logger.info("ℹ️ [PurchaseOrdersRepository.createPurchaseOrderItems] Creating purchase order items...");
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
      logger.info("✅ [PurchaseOrdersRepository.createPurchaseOrderItems] Purchase order items created successfully");
      return rows;
    } catch (error) {
      logger.error("❌ [PurchaseOrdersRepository.createPurchaseOrderItems] Error:", error);
      throw error;
    }
  }

  async updatePurchaseOrderItem(
    id: string,
    data: Partial<PurchaseOrderItemInsertType>,
    tx?: DbTransaction
  ): Promise<PurchaseOrderItemType> {
    try {
      const dbClient = tx ?? db;
      logger.info("ℹ️ [PurchaseOrdersRepository.updatePurchaseOrderItem] Updating purchase order item...");
      const [row] = await dbClient
        .update(PurchaseOrderItemsTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(PurchaseOrderItemsTable.id, id))
        .returning();
      if (!row) throw new Error("[PurchaseOrdersRepository.updatePurchaseOrderItem] Purchase order item not found");
      logger.info("✅ [PurchaseOrdersRepository.updatePurchaseOrderItem] Purchase order item updated successfully");
      return row;
    } catch (error) {
      logger.error("❌ [PurchaseOrdersRepository.updatePurchaseOrderItem] Error:", error);
      throw error;
    }
  }

  async deletePurchaseOrderItem(id: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx ?? db;
      await dbClient.delete(PurchaseOrderItemsTable).where(eq(PurchaseOrderItemsTable.id, id));
      logger.info("✅ [PurchaseOrdersRepository.deletePurchaseOrderItem] Purchase order item deleted successfully");
      return true;
    } catch (error) {
      logger.error("❌ [PurchaseOrdersRepository.deletePurchaseOrderItem] Error:", error);
      throw error;
    }
  }

  /**
   * Returns all non-cancelled/rejected POs for the same outlet on the same calendar delivery date,
   * each with their summed item quantity. Used to compute the group-level QOM charge.
   *
   * @param excludePurchaseOrderNo - PO being created right now; exclude it so we only get siblings.
   */
  async getSiblingPurchaseOrdersWithQty(
    outletId: string,
    deliveryDate: Date,
    organizationId: string,
    excludePurchaseOrderNo?: string,
    tx?: DbTransaction
  ): Promise<Array<{ id: string; purchaseOrderNo: string; totalQty: number }>> {
    try {
      const dbClient = tx ?? db;

      const startOfDay = new Date(deliveryDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(deliveryDate);
      endOfDay.setUTCHours(23, 59, 59, 999);

      const conditions = [
        eq(PurchaseOrdersTable.outletId, outletId),
        eq(PurchaseOrdersTable.organizationId, organizationId),
        gte(PurchaseOrdersTable.scheduledDeliveryDate, startOfDay),
        lte(PurchaseOrdersTable.scheduledDeliveryDate, endOfDay),
        notInArray(PurchaseOrdersTable.status, ['CANCELLED', 'REJECTED']),
      ];

      if (excludePurchaseOrderNo) {
        conditions.push(ne(PurchaseOrdersTable.purchaseOrderNo, excludePurchaseOrderNo));
      }

      const rows = await dbClient
        .select({
          id: PurchaseOrdersTable.id,
          purchaseOrderNo: PurchaseOrdersTable.purchaseOrderNo,
          totalQty: sql<string>`COALESCE(SUM(${PurchaseOrderItemsTable.qtyRequired}::numeric), '0')`,
        })
        .from(PurchaseOrdersTable)
        .leftJoin(
          PurchaseOrderItemsTable,
          eq(PurchaseOrdersTable.purchaseOrderNo, PurchaseOrderItemsTable.purchaseOrderNo)
        )
        .where(and(...conditions))
        .groupBy(PurchaseOrdersTable.id, PurchaseOrdersTable.purchaseOrderNo);

      return rows.map((r) => ({
        id: r.id,
        purchaseOrderNo: r.purchaseOrderNo,
        totalQty: parseFloat(r.totalQty),
      }));
    } catch (error) {
      logger.error("❌ [PurchaseOrdersRepository.getSiblingPurchaseOrdersWithQty] Error:", error);
      throw error;
    }
  }

  async deletePurchaseOrderItemsByPurchaseOrderNo(purchaseOrderNo: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx ?? db;
      await dbClient.delete(PurchaseOrderItemsTable).where(eq(PurchaseOrderItemsTable.purchaseOrderNo, purchaseOrderNo));
      logger.info("✅ [PurchaseOrdersRepository.deletePurchaseOrderItemsByPurchaseOrderNo] Purchase order items deleted successfully");
      return true;
    } catch (error) {
      logger.error("❌ [PurchaseOrdersRepository.deletePurchaseOrderItemsByPurchaseOrderNo] Error:", error);
      throw error;
    }
  }
}
