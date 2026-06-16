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
  DoItemAllocationsTable,
  DoItemAllocationInsertType,
  DoItemAllocationType,
  DeliveryOrderType,
  DeliveryOrderInsertType,
  DeliveryOrderFilter,
  DeliveryOrderItemType,
  DeliveryOrderItemInsertType,
  DeliveryOrderItemFilter,
} from "./delivery-orders.model";
import { SkuTable } from "@/features/master-data/sku.model";
import { GrnItemsTable } from "@/features/inbound/grns.model";
import { GrnsTable } from "@/features/inbound/grns.model";
import { InventoryBalancesTable } from "@/features/inventory/inventory-balance/inventory.model";
import { RacksTable } from "@/features/master-data/racks.model";
import { PurchaseOrdersTable } from "./purchase-orders.model";
import { OutletsTable } from "@/features/master-data/outlets.model";
import { PaginationParams, PaginatedResponse } from "@/features/rbac/rbac.model";
import { pagination, PgQueryType } from "@/util/pagination";
import { DbTransaction } from "@/types/db-transaction";
import { eq, and, like, inArray, gte, lte, or, sum, notInArray } from "drizzle-orm";

export type DoItemAllocationWithDetails = {
  id: string;
  doItemId: string;
  grnItemId: string;
  grnNo: string | null;
  rackId: string | null;
  /** Display string for rack location (e.g. "A-3" from rackRow-rackColumn) */
  rackName: string | null;
  expiryDate: Date | null;
  lotNo: string | null;
  qtyAllocated: string;
  priorityFlag: boolean;
};

export type DeliveryOrderItemWithDetails = DeliveryOrderItemType & {
  skuCode: string | null;
  skuDescription: string | null;
  doId: string | null;
  doNo: string | null;
  doStatus: string | null;
  onHandQty: string | null;
  lossQty: string | null;
  reservedQty: string | null;
  allocations?: DoItemAllocationWithDetails[];
};

export class DeliveryOrdersRepositoryClass {
  constructor() {}

  // ============================================
  // Delivery Orders
  // ============================================

  async getDeliveryOrders(
    filter: DeliveryOrderFilter,
    paginationParams: PaginationParams,
    organizationId?: string
  ): Promise<PaginatedResponse<DeliveryOrderType>> {
    try {
      logger.info("ℹ️ [DeliveryOrdersRepository.getDeliveryOrders] Getting delivery orders...");
      const whereCondition: ReturnType<typeof eq>[] = [];

      if (organizationId) {
        whereCondition.push(eq(DeliveryOrdersTable.organizationId, organizationId));
      }

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

  async getDeliveryOrderById(id: string, organizationId?: string): Promise<DeliveryOrderType | null> {
    try {
      const whereConditions = [eq(DeliveryOrdersTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(DeliveryOrdersTable.organizationId, organizationId));
      }
      const [row] = await db
        .select()
        .from(DeliveryOrdersTable)
        .where(and(...whereConditions))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error("❌ [DeliveryOrdersRepository.getDeliveryOrderById] Error:", error);
      throw error;
    }
  }

  async getDeliveryOrderByPurchaseOrderId(purchaseOrderId: string, organizationId?: string): Promise<DeliveryOrderType | null> {
    try {
      const whereConditions = [eq(DeliveryOrdersTable.purchaseOrderId, purchaseOrderId)];
      if (organizationId) {
        whereConditions.push(eq(DeliveryOrdersTable.organizationId, organizationId));
      }
      const [row] = await db
        .select()
        .from(DeliveryOrdersTable)
        .where(and(...whereConditions))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error("❌ [DeliveryOrdersRepository.getDeliveryOrderByPurchaseOrderId] Error:", error);
      throw error;
    }
  }

  async createDeliveryOrder(data: DeliveryOrderInsertType & { organizationId: string }, tx?: DbTransaction): Promise<DeliveryOrderType> {
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
    organizationId?: string,
    tx?: DbTransaction
  ): Promise<DeliveryOrderType> {
    try {
      const dbClient = tx ?? db;
      logger.info("ℹ️ [DeliveryOrdersRepository.updateDeliveryOrder] Updating delivery order...");
      const whereConditions = [eq(DeliveryOrdersTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(DeliveryOrdersTable.organizationId, organizationId));
      }
      const [row] = await dbClient
        .update(DeliveryOrdersTable)
        .set({ ...data, updatedAt: new Date() })
        .where(and(...whereConditions))
        .returning();
      if (!row) throw new Error("[DeliveryOrdersRepository.updateDeliveryOrder] Delivery order not found");
      logger.info("✅ [DeliveryOrdersRepository.updateDeliveryOrder] Delivery order updated successfully");
      return row;
    } catch (error) {
      logger.error("❌ [DeliveryOrdersRepository.updateDeliveryOrder] Error:", error);
      throw error;
    }
  }

  async deleteDeliveryOrder(id: string, organizationId?: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx ?? db;
      const whereConditions = [eq(DeliveryOrdersTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(DeliveryOrdersTable.organizationId, organizationId));
      }
      await dbClient.delete(DeliveryOrdersTable).where(and(...whereConditions));
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

  /**
   * Fetch all delivery order items for a purchase order, joined with SkuTable to return skuCode.
   * Used in updatePurchaseOrder to match PO items (by skuCode) to DO items (by skuId).
   */
  async getDeliveryOrderItemsForPo(
    purchaseOrderId: string,
    tx?: DbTransaction
  ): Promise<Array<{ id: string; skuId: string; skuCode: string | null; qtyRequired: string }>> {
    try {
      const dbClient = tx ?? db;
      const rows = await dbClient
        .select({
          id: DeliveryOrderItemsTable.id,
          skuId: DeliveryOrderItemsTable.skuId,
          skuCode: SkuTable.skuCode,
          qtyRequired: DeliveryOrderItemsTable.qtyRequired,
        })
        .from(DeliveryOrderItemsTable)
        .leftJoin(SkuTable, eq(DeliveryOrderItemsTable.skuId, SkuTable.skuId))
        .where(eq(DeliveryOrderItemsTable.purchaseOrderId, purchaseOrderId));
      return rows;
    } catch (error) {
      logger.error("❌ [DeliveryOrdersRepository.getDeliveryOrderItemsForPo] Error:", error);
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

      if (filter.regionIds && filter.regionIds.length > 0) {
        whereConditions.push(inArray(OutletsTable.regionId, filter.regionIds));
      } else if (filter.regionId) {
        whereConditions.push(eq(OutletsTable.regionId, filter.regionId));
      }

      if (filter.scheduledDeliveryDateFrom) {
        whereConditions.push(gte(PurchaseOrdersTable.scheduledDeliveryDate, new Date(filter.scheduledDeliveryDateFrom)));
      }

      if (filter.scheduledDeliveryDateTo) {
        const toDate = new Date(filter.scheduledDeliveryDateTo);
        toDate.setUTCHours(23, 59, 59, 999);
        whereConditions.push(lte(PurchaseOrdersTable.scheduledDeliveryDate, toDate));
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
          lotNo: DeliveryOrderItemsTable.lotNo,
          expiryDate: DeliveryOrderItemsTable.expiryDate,
          createdAt: DeliveryOrderItemsTable.createdAt,
          updatedAt: DeliveryOrderItemsTable.updatedAt,
          createdBy: DeliveryOrderItemsTable.createdBy,
          updatedBy: DeliveryOrderItemsTable.updatedBy,
          skuCode: SkuTable.skuCode,
          skuDescription: SkuTable.skuDescription,
          doId: DeliveryOrdersTable.id,
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
        .leftJoin(PurchaseOrdersTable, eq(DeliveryOrderItemsTable.purchaseOrderId, PurchaseOrdersTable.id))
        .leftJoin(OutletsTable, eq(PurchaseOrdersTable.outletId, OutletsTable.outletId))
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

  // ============================================
  // DO Item Allocations
  // ============================================

  /**
   * Returns GRN items for a SKU with their available (unallocated) quantity.
   * Available = grn_item.qty minus any qty already allocated in active DOs.
   * Joins with the grns table to get grnNo for display.
   */
  async getGrnItemsWithAvailableQty(
    skuId: string,
    tx?: DbTransaction
  ): Promise<Array<{
    id: string;
    grnId: string;
    grnNo: string | null;
    rackId: string | null;
    expiryDate: Date | null;
    lotNo: string | null;
    priorityFlag: boolean;
    qty: string;
    createdAt: Date;
    allocatedQty: string;
  }>> {
    try {
      const dbClient = tx ?? db;

      // Get all grn items for this SKU with their GRN number
      const grnItems = await dbClient
        .select({
          id: GrnItemsTable.id,
          grnId: GrnItemsTable.grnId,
          grnNo: GrnsTable.grnNo,
          rackId: GrnItemsTable.rackId,
          expiryDate: GrnItemsTable.expiryDate,
          lotNo: GrnItemsTable.lotNo,
          priorityFlag: GrnItemsTable.priorityFlag,
          qty: GrnItemsTable.qty,
          createdAt: GrnItemsTable.createdAt,
        })
        .from(GrnItemsTable)
        .leftJoin(GrnsTable, eq(GrnItemsTable.grnId, GrnsTable.id))
        .where(eq(GrnItemsTable.skuId, skuId));

      if (grnItems.length === 0) return [];

      // Get allocated quantities from active DOs (not SHIPPED/DELIVERED/CANCELLED)
      const grnItemIds = grnItems.map((g) => g.id);
      const allocated = await dbClient
        .select({
          grnItemId: DoItemAllocationsTable.grnItemId,
          totalAllocated: sum(DoItemAllocationsTable.qtyAllocated),
        })
        .from(DoItemAllocationsTable)
        .innerJoin(
          DeliveryOrderItemsTable,
          eq(DoItemAllocationsTable.doItemId, DeliveryOrderItemsTable.id)
        )
        .innerJoin(
          DeliveryOrdersTable,
          eq(DeliveryOrderItemsTable.purchaseOrderId, DeliveryOrdersTable.purchaseOrderId)
        )
        .where(
          and(
            inArray(DoItemAllocationsTable.grnItemId, grnItemIds),
            notInArray(DeliveryOrdersTable.status, ['SHIPPED', 'DELIVERED', 'CANCELLED'])
          )
        )
        .groupBy(DoItemAllocationsTable.grnItemId);

      const allocatedMap = new Map(allocated.map((a) => [a.grnItemId, a.totalAllocated ?? '0']));

      return grnItems.map((g) => ({
        ...g,
        grnNo: g.grnNo ?? null,
        allocatedQty: allocatedMap.get(g.id) ?? '0',
      }));
    } catch (error) {
      logger.error('❌ [DeliveryOrdersRepository.getGrnItemsWithAvailableQty] Error:', error);
      throw error;
    }
  }

  /**
   * Insert pick-list allocations for a delivery order.
   * Replaces any existing allocations for the same DO items.
   */
  async createDoItemAllocations(
    allocations: DoItemAllocationInsertType[],
    tx?: DbTransaction
  ): Promise<DoItemAllocationType[]> {
    try {
      if (allocations.length === 0) return [];
      const dbClient = tx ?? db;
      const rows = await dbClient
        .insert(DoItemAllocationsTable)
        .values(allocations.map((a) => ({ ...a, createdAt: new Date() })))
        .returning();
      logger.info(`✅ [DeliveryOrdersRepository.createDoItemAllocations] Inserted ${rows.length} allocation(s)`);
      return rows;
    } catch (error) {
      logger.error('❌ [DeliveryOrdersRepository.createDoItemAllocations] Error:', error);
      throw error;
    }
  }

  /** Delete all allocations for a set of DO item IDs (used before re-allocating). */
  async deleteDoItemAllocations(doItemIds: string[], tx?: DbTransaction): Promise<void> {
    if (doItemIds.length === 0) return;
    const dbClient = tx ?? db;
    await dbClient
      .delete(DoItemAllocationsTable)
      .where(inArray(DoItemAllocationsTable.doItemId, doItemIds));
  }

  /**
   * Get allocations for a set of DO item IDs, with GRN details for display.
   */
  async getDoItemAllocationsWithDetails(
    doItemIds: string[],
    tx?: DbTransaction
  ): Promise<DoItemAllocationWithDetails[]> {
    if (doItemIds.length === 0) return [];
    const dbClient = tx ?? db;
    const rows = await dbClient
      .select({
        id: DoItemAllocationsTable.id,
        doItemId: DoItemAllocationsTable.doItemId,
        grnItemId: DoItemAllocationsTable.grnItemId,
        grnNo: GrnsTable.grnNo,
        rackId: DoItemAllocationsTable.rackId,
        rackRow: RacksTable.rackRow,
        rackColumn: RacksTable.rackColumn,
        rackLevel: RacksTable.rackLevel,
        expiryDate: GrnItemsTable.expiryDate,
        lotNo: GrnItemsTable.lotNo,
        qtyAllocated: DoItemAllocationsTable.qtyAllocated,
        priorityFlag: GrnItemsTable.priorityFlag,
      })
      .from(DoItemAllocationsTable)
      .innerJoin(GrnItemsTable, eq(DoItemAllocationsTable.grnItemId, GrnItemsTable.id))
      .leftJoin(GrnsTable, eq(GrnItemsTable.grnId, GrnsTable.id))
      .leftJoin(RacksTable, eq(DoItemAllocationsTable.rackId, RacksTable.rackId))
      .where(inArray(DoItemAllocationsTable.doItemId, doItemIds));

    return rows.map((r) => {
      const rackName =
        r.rackRow != null && r.rackColumn != null
          ? `${r.rackRow}-${r.rackColumn}${r.rackLevel != null ? `-${r.rackLevel}` : ""}`
          : null;
      return {
        id: r.id,
        doItemId: r.doItemId,
        grnItemId: r.grnItemId,
        grnNo: r.grnNo ?? null,
        rackId: r.rackId ?? null,
        rackName,
        expiryDate: r.expiryDate ?? null,
        lotNo: r.lotNo ?? null,
        qtyAllocated: r.qtyAllocated,
        priorityFlag: r.priorityFlag,
      };
    });
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
