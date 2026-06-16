/**
 * Inventory Movements Repository
 * 
 * @description Data access layer for Inventory Movements operations.
 */

import { db } from '@/db';
import { InventoryMovementsTable, InventoryMovementType } from './inventory.model';
import { eq, and, inArray, like, gte, lte, asc, desc, sql, isNotNull } from 'drizzle-orm';
import { GrnsTable, GrnItemsTable } from '@/features/inbound/grns.model';
import { DeliveryOrdersTable, DeliveryOrderItemsTable } from '@/features/outbound/delivery-orders.model';
import { StockAdjustmentsTable, StockAdjustmentItemsTable } from '@/features/inventory/stock-adjustment/stock-adjustment.model';
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
  regionId?: string | string[];
  movementType?: InventoryMovementType | InventoryMovementType[];
  referenceNo?: string;
  stockAdjustmentId?: string;
  rackId?: string;
  reason?: string;
  dateFrom?: string;
  dateTo?: string;
}
export class InventoryMovementRepositoryClass {
    constructor(
      private readonly inventoryBalanceRepository: InventoryBalanceRepositoryClass,
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

      if (Array.isArray(filter.regionId)) {
        whereCondition.push(inArray(InventoryMovementsTable.regionId, filter.regionId));
      } else if (filter.regionId) {
        whereCondition.push(eq(InventoryMovementsTable.regionId, filter.regionId));
      }

      if (Array.isArray(filter.movementType)) {
        whereCondition.push(inArray(InventoryMovementsTable.movementType, filter.movementType));
      } else if (filter.movementType) {
        whereCondition.push(eq(InventoryMovementsTable.movementType, filter.movementType));
      }

      if (filter.referenceNo) {
        whereCondition.push(like(InventoryMovementsTable.referenceNo, `%${filter.referenceNo}%`));
      }

      if (filter.stockAdjustmentId) {
        whereCondition.push(eq(InventoryMovementsTable.stockAdjustmentId, filter.stockAdjustmentId));
      }

      if (filter.rackId) {
        whereCondition.push(eq(InventoryMovementsTable.rackId, filter.rackId));
      }

      if (filter.reason) {
        whereCondition.push(like(InventoryMovementsTable.reason, `%${filter.reason}%`));
      }

      if (filter.dateFrom) {
        whereCondition.push(gte(InventoryMovementsTable.createdAt, new Date(filter.dateFrom)));
      }

      if (filter.dateTo) {
        whereCondition.push(lte(InventoryMovementsTable.createdAt, new Date(filter.dateTo)));
      }

      const baseQuery = db
        .select()
        .from(InventoryMovementsTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined)

      if (paginationParams.sortBy) {
        baseQuery.orderBy(sql`${sql.identifier(paginationParams.sortBy)} ${sql.raw(paginationParams.sortOrder || 'ASC')}`);
      } else {
        baseQuery.orderBy(desc(InventoryMovementsTable.createdAt));
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
   * Get per-batch, per-location stock details for a SKU.
   *
   * Rack resolution strategy:
   * - For INBOUND movements (originating from GRNs), the rack is looked up via
   *   grn_items (matched on sku_id + lot_no + expiry_date) → grn_item_racks → m_racks.
   *   A GRN item may span multiple racks, so each rack gets its own row.
   * - For all other movement types (ADJUSTMENT, DAMAGED, etc.) that carry a direct
   *   rack_id on the movement row, that rack_id is used as a fallback.
   * - Movements with no resolvable rack are grouped under a NULL rack.
   *
   * Results are grouped by (lotNo, expiryDate, resolved_rack_id) and only rows
   * with a positive on-hand quantity are returned.
   */
  async getSkuStockDetails(skuId: string): Promise<Array<{
    lotNo: string | null;
    expiryDate: Date | null;
    rackId: string | null;
    rackRow: string | null;
    rackColumn: string | null;
    rackLevel: string | null;
    onHandQty: string;
    lossQty: string;
    reservedQty: string;
    firstInboundAt: Date | null;
  }>> {
    try {
      logger.info("ℹ️ [InventoryMovementsRepository.getSkuStockDetails] Getting SKU stock details...");

      const result = await db.execute(sql`
        WITH resolved AS (
          SELECT
            im.id,
            im.lot_no,
            im.expiry_date,
            im.movement_type,
            im.quantity,
            im.loss_qty,
            im.created_at,
            -- For INBOUND movements, expand across all racks recorded in grn_item_racks.
            -- For other movements, use the rack_id stored directly on the movement row.
            COALESCE(gir.rack_id, im.rack_id) AS resolved_rack_id
          FROM main.inventory_movements im
          LEFT JOIN main.grn_items gi
            ON gi.sku_id = im.sku_id
            AND (gi.lot_no IS NOT DISTINCT FROM im.lot_no)
            AND (gi.expiry_date IS NOT DISTINCT FROM im.expiry_date)
            AND im.movement_type = 'INBOUND'
          LEFT JOIN main.grn_item_racks gir
            ON gir.grn_item_id = gi.id
          WHERE im.sku_id = ${skuId}
        )
        SELECT
          r.lot_no AS "lotNo",
          r.expiry_date AS "expiryDate",
          r.resolved_rack_id AS "rackId",
          rack.rack_row AS "rackRow",
          rack.rack_column AS "rackColumn",
          rack.rack_level AS "rackLevel",
          SUM(
            CASE
              WHEN r.movement_type IN ('INBOUND', 'ADJUSTMENT', 'RETURN_IN') THEN r.quantity
              WHEN r.movement_type IN ('SHIPMENT', 'DAMAGED') THEN -r.quantity
              ELSE 0
            END
          )::text AS "onHandQty",
          SUM(
            CASE
              WHEN r.movement_type = 'DAMAGED' THEN r.quantity
              WHEN r.movement_type = 'INBOUND' THEN COALESCE(r.loss_qty, 0)
              ELSE 0
            END
          )::text AS "lossQty",
          SUM(
            CASE
              WHEN r.movement_type = 'RESERVED' THEN r.quantity
              WHEN r.movement_type = 'SHIPMENT' THEN -r.quantity
              ELSE 0
            END
          )::text AS "reservedQty",
          MIN(
            CASE WHEN r.movement_type = 'INBOUND' THEN r.created_at END
          ) AS "firstInboundAt"
        FROM resolved r
        LEFT JOIN main.m_racks rack ON rack.rack_id = r.resolved_rack_id
        GROUP BY r.lot_no, r.expiry_date, r.resolved_rack_id, rack.rack_row, rack.rack_column, rack.rack_level
        HAVING SUM(
          CASE
            WHEN r.movement_type IN ('INBOUND', 'ADJUSTMENT', 'RETURN_IN') THEN r.quantity
            WHEN r.movement_type IN ('SHIPMENT', 'DAMAGED') THEN -r.quantity
            ELSE 0
          END
        ) > 0
        ORDER BY "firstInboundAt" ASC NULLS LAST
      `);

      logger.info("✅ [InventoryMovementsRepository.getSkuStockDetails] SKU stock details fetched successfully");
      return result.rows as any[];
    } catch (error) {
      logger.error("❌ [InventoryMovementsRepository.getSkuStockDetails] Error:", error);
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
   * Create one or multiple inventory movements
   */
  async createInventoryMovement(
    data: InventoryMovementsInsertType | InventoryMovementsInsertType[],
    userId: string,
    organizationId: string,
    tx?: DbTransaction,
  ): Promise<InventoryMovementsType | InventoryMovementsType[]> {
    try {

      const client = tx ?? db;
      logger.info("ℹ️ [InventoryMovementsRepository.createInventoryMovement] Creating inventory movement(s)...");

      const movements = Array.isArray(data) ? data : [data];

      if (movements.length === 0) {
        return Array.isArray(data) ? [] : (null as unknown as InventoryMovementsType);
      }

      const skuIds = Array.from(
        new Set(movements.map((movement) => movement.skuId as string)),
      );

      const existingBalances =
        (await this.inventoryBalanceRepository.getInventoryBalanceBySkuIds(
          skuIds,
        )) ?? [];

      const balanceMap = new Map<
        string,
        { onHand: number; loss: number; reserved: number }
      >();

      for (const balance of existingBalances) {
        const skuId = balance.skuId as string;
        balanceMap.set(skuId, {
          onHand: Number(balance.onHandQty ?? "0"),
          loss: Number(balance.lossQty ?? "0"),
          reserved: Number(balance.reservedQty ?? "0"),
        });
      }

      const movementsWithBalanceAfter = movements.map((movement) => {
        const skuId = movement.skuId as string;

        const current =
          balanceMap.get(skuId) ??
          {
            onHand: 0,
            loss: 0,
            reserved: 0,
          };

        let { onHand, loss, reserved } = current;
        const quantity = Number(movement.quantity ?? "0");
        const movementLossQty = Number(movement.lossQty ?? "0");

        switch (movement.movementType) {
          case InventoryMovementType.INBOUND:
            onHand += quantity;
            loss += movementLossQty;
            break;
          case InventoryMovementType.RESERVED:
            reserved += quantity;
            break;
          case InventoryMovementType.SHIPMENT:
            reserved -= quantity;
            onHand -= quantity;
            break;
          case InventoryMovementType.ADJUSTMENT:
            onHand += quantity;
            break;
          case InventoryMovementType.DAMAGED:
            onHand -= quantity;
            loss += quantity;
            break;
          case InventoryMovementType.LOSS_ADJUSTMENT:
            loss += quantity; // quantity can be negative
            break;
          case InventoryMovementType.TRANSFER_OUT:
          case InventoryMovementType.TRANSFER_IN:
            // No-op on org-level balance by design. inventory_balances are
            // org+SKU level totals; rack-to-rack transfers relocate stock
            // between racks without changing the org's on-hand/loss/reserved
            // for the SKU. The movement rows are still recorded for rack-level
            // traceability, but they must not adjust the org balance.
            break;
        }

        balanceMap.set(skuId, { onHand, loss, reserved });

        const balanceAfter = onHand;

        return {
          ...movement,
          balanceAfter: balanceAfter.toString(),
        };
      });

      for (const [skuId, { onHand, loss, reserved }] of balanceMap.entries()) {
        await this.inventoryBalanceRepository.upsertInventoryBalance(
          {
            skuId,
            organizationId: organizationId,
            onHandQty: onHand.toString(),
            lossQty: loss.toString(),
            reservedQty: reserved.toString(),
            updatedAt: new Date(),
          },
          tx,
        );
      }

      const inventoryMovements = await client
        .insert(InventoryMovementsTable)
        .values(movementsWithBalanceAfter)
        .returning();

      logger.info(
        "✅ [InventoryMovementsRepository.createInventoryMovement] Inventory Movement(s) created successfully",
      );

      return Array.isArray(data)
        ? inventoryMovements
        : inventoryMovements[0];
    } catch (error) {
      logger.error(
        "❌ [InventoryMovementsRepository.createInventoryMovement] Error:",
        error,
      );
      throw error;
    }
  }

  /**
   * Check which approved GRNs, shipped DOs, and stock adjustments for a SKU
   * are missing their corresponding inventory_movements records.
   */
  async checkSkuIntegrity(skuId: string) {
    // --- GRN check ---
    const approvedGrnItems = await db
      .select({
        grnItemId: GrnItemsTable.id,
        grnNo: GrnsTable.grnNo,
        qty: GrnItemsTable.qty,
        receivedAt: GrnsTable.receivedAt,
      })
      .from(GrnItemsTable)
      .innerJoin(GrnsTable, eq(GrnItemsTable.grnId, GrnsTable.id))
      .where(and(eq(GrnItemsTable.skuId, skuId), eq(GrnsTable.status, 'Approved')));

    const inboundMovements = await db
      .select({ referenceNo: InventoryMovementsTable.referenceNo })
      .from(InventoryMovementsTable)
      .where(and(
        eq(InventoryMovementsTable.skuId, skuId),
        eq(InventoryMovementsTable.movementType, InventoryMovementType.INBOUND),
      ));
    const coveredGrnNos = new Set(inboundMovements.map((m) => m.referenceNo).filter(Boolean));

    const missingGrnMovements = approvedGrnItems
      .filter((item) => !coveredGrnNos.has(item.grnNo))
      .map((item) => ({
        grnNo: item.grnNo,
        grnItemId: item.grnItemId,
        qty: item.qty?.toString() ?? '0',
        receivedAt: item.receivedAt instanceof Date ? item.receivedAt.toISOString() : item.receivedAt,
      }));

    // --- DO check ---
    // RESERVED movements reliably have referenceNo = poNo (set when DO enters picking).
    // SHIPMENT movements historically have null referenceNo (only new ones have poNo after our fix).
    // Strategy:
    //   1. Exact match: SHIPMENT with referenceNo = poNo → definitely covered.
    //   2. Pool match: if a RESERVED movement exists for poNo (meaning the DO was processed),
    //      consume one null-referenceNo SHIPMENT from the pool → likely covered historically.
    //   3. No match + pool exhausted → truly missing.

    const shippedDoItems = await db
      .select({
        doItemId: DeliveryOrderItemsTable.id,
        poNo: DeliveryOrdersTable.poNo,
        doNo: DeliveryOrdersTable.doNo,
        qtyRequired: DeliveryOrderItemsTable.qtyRequired,
      })
      .from(DeliveryOrderItemsTable)
      .innerJoin(DeliveryOrdersTable, eq(DeliveryOrderItemsTable.purchaseOrderId, DeliveryOrdersTable.purchaseOrderId))
      .where(and(eq(DeliveryOrderItemsTable.skuId, skuId), eq(DeliveryOrdersTable.status, 'SHIPPED')));

    // All SHIPMENT movements for this SKU
    const allShipmentMovements = await db
      .select({ referenceNo: InventoryMovementsTable.referenceNo })
      .from(InventoryMovementsTable)
      .where(and(
        eq(InventoryMovementsTable.skuId, skuId),
        eq(InventoryMovementsTable.movementType, InventoryMovementType.SHIPMENT),
      ));

    // RESERVED movements that have a referenceNo (= poNo) — used to confirm DO was processed
    const reservedMovements = await db
      .select({ referenceNo: InventoryMovementsTable.referenceNo })
      .from(InventoryMovementsTable)
      .where(and(
        eq(InventoryMovementsTable.skuId, skuId),
        eq(InventoryMovementsTable.movementType, InventoryMovementType.RESERVED),
        isNotNull(InventoryMovementsTable.referenceNo),
      ));
    const reservedPoNos = new Set(reservedMovements.map((m) => m.referenceNo as string));

    // Exact matches (new data: SHIPMENT.referenceNo = poNo)
    const coveredByRef = new Set(allShipmentMovements.map((m) => m.referenceNo).filter(Boolean) as string[]);
    // Pool of historical null-referenceNo SHIPMENTs available to attribute to old DOs
    let unattributedShipmentPool = allShipmentMovements.filter((m) => !m.referenceNo).length;

    const missingDoMovements: { poNo: string; doNo: string; doItemId: string; qtyRequired: string }[] = [];

    for (const item of shippedDoItems) {
      if (coveredByRef.has(item.poNo)) continue; // exact match
      if (reservedPoNos.has(item.poNo) && unattributedShipmentPool > 0) {
        // Historical: RESERVED confirms DO was processed, consume one from pool
        unattributedShipmentPool--;
        continue;
      }
      // Truly missing
      missingDoMovements.push({
        poNo: item.poNo,
        doNo: item.doNo,
        doItemId: item.doItemId,
        qtyRequired: item.qtyRequired?.toString() ?? '0',
      });
    }

    // --- Adjustment check ---
    const adjustmentItems = await db
      .select({
        adjustmentItemId: StockAdjustmentItemsTable.id,
        stockAdjustmentId: StockAdjustmentItemsTable.stockAdjustmentId,
        adjustmentNo: StockAdjustmentsTable.adjustmentNo,
        quantity: StockAdjustmentItemsTable.quantity,
        movementType: StockAdjustmentItemsTable.movementType,
      })
      .from(StockAdjustmentItemsTable)
      .innerJoin(StockAdjustmentsTable, eq(StockAdjustmentItemsTable.stockAdjustmentId, StockAdjustmentsTable.id))
      .where(eq(StockAdjustmentItemsTable.skuId, skuId));

    const adjMovements = await db
      .select({ stockAdjustmentId: InventoryMovementsTable.stockAdjustmentId })
      .from(InventoryMovementsTable)
      .where(and(
        eq(InventoryMovementsTable.skuId, skuId),
        inArray(InventoryMovementsTable.movementType, [InventoryMovementType.ADJUSTMENT, InventoryMovementType.DAMAGED]),
      ));
    const coveredAdjIds = new Set(adjMovements.map((m) => m.stockAdjustmentId).filter(Boolean));

    const missingAdjustmentMovements = adjustmentItems
      .filter((item) => !coveredAdjIds.has(item.stockAdjustmentId))
      .map((item) => ({
        adjustmentNo: item.adjustmentNo,
        stockAdjustmentId: item.stockAdjustmentId,
        adjustmentItemId: item.adjustmentItemId,
        quantity: item.quantity?.toString() ?? '0',
        movementType: item.movementType as InventoryMovementType,
      }));

    return {
      skuId,
      missingGrnMovements,
      missingDoMovements,
      missingAdjustmentMovements,
      totalMissing: missingGrnMovements.length + missingDoMovements.length + missingAdjustmentMovements.length,
    };
  }

  /**
   * Backfill missing inventory_movements for a SKU and then reconcile balances.
   */
  async backfillSkuMovements(
    skuId: string,
    organizationId: string,
    userId: string,
    tx?: DbTransaction,
  ) {
    const missing = await this.checkSkuIntegrity(skuId);

    if (missing.totalMissing === 0) {
      const reconcile = await this.reconcileSkuBalance(skuId, organizationId, tx);
      return { skuId, backfilledCount: 0, reconcileResult: reconcile };
    }

    const movementsToCreate: InventoryMovementsInsertType[] = [
      ...missing.missingGrnMovements.map((item) => ({
        skuId,
        movementType: InventoryMovementType.INBOUND,
        quantity: item.qty,
        referenceNo: item.grnNo,
        reason: 'Backfilled inbound',
        createdBy: userId,
      })),
      ...missing.missingDoMovements.map((item) => ({
        skuId,
        movementType: InventoryMovementType.SHIPMENT,
        quantity: item.qtyRequired,
        referenceNo: item.poNo,
        reason: 'Backfilled shipment',
        createdBy: userId,
      })),
      ...missing.missingAdjustmentMovements.map((item) => ({
        skuId,
        movementType: item.movementType,
        quantity: item.quantity,
        referenceNo: item.adjustmentNo,
        stockAdjustmentId: item.stockAdjustmentId,
        reason: 'Backfilled adjustment',
        createdBy: userId,
      })),
    ];

    await this.createInventoryMovement(movementsToCreate, userId, organizationId, tx);

    const reconcileResult = await this.reconcileSkuBalance(skuId, organizationId, tx);

    return {
      skuId,
      backfilledCount: movementsToCreate.length,
      reconcileResult,
    };
  }

  /**
   * Reconcile SKU balance by replaying all movements from zero.
   * Recomputes every balanceAfter in chronological order and updates inventory_balances.
   */
  async reconcileSkuBalance(
    skuId: string,
    organizationId: string,
    tx?: DbTransaction,
  ): Promise<{
    movementsFixed: number;
    finalOnHandQty: string;
    finalLossQty: string;
    finalReservedQty: string;
  }> {
    const client = tx ?? db;
    logger.info(`ℹ️ [InventoryMovementsRepository.reconcileSkuBalance] Reconciling SKU ${skuId}...`);

    const movements = await client
      .select()
      .from(InventoryMovementsTable)
      .where(eq(InventoryMovementsTable.skuId, skuId))
      .orderBy(asc(InventoryMovementsTable.createdAt));

    let onHand = 0;
    let loss = 0;
    let reserved = 0;

    for (const movement of movements) {
      const qty = Number(movement.quantity ?? '0');
      const lossQty = Number(movement.lossQty ?? '0');

      switch (movement.movementType) {
        case InventoryMovementType.INBOUND:
          onHand += qty;
          loss += lossQty;
          break;
        case InventoryMovementType.ADJUSTMENT:
          onHand += qty;
          break;
        case InventoryMovementType.SHIPMENT:
          onHand -= qty;
          reserved -= qty;
          break;
        case InventoryMovementType.DAMAGED:
          onHand -= qty;
          loss += qty;
          break;
        case InventoryMovementType.RESERVED:
          reserved += qty;
          break;
        case InventoryMovementType.LOSS_ADJUSTMENT:
          loss += qty; // quantity can be negative
          break;
        case InventoryMovementType.TRANSFER_OUT:
        case InventoryMovementType.TRANSFER_IN:
          // No-op: rack-to-rack transfers don't change org+SKU level balance.
          break;
        case InventoryMovementType.RETURN_IN:
          onHand += qty;
          break;
        case InventoryMovementType.RETURN_DAMAGED:
          loss += qty;
          break;
      }

      await client
        .update(InventoryMovementsTable)
        .set({ balanceAfter: onHand.toString() })
        .where(eq(InventoryMovementsTable.id, movement.id));
    }

    await this.inventoryBalanceRepository.upsertInventoryBalance(
      {
        skuId,
        organizationId,
        onHandQty: onHand.toString(),
        lossQty: loss.toString(),
        reservedQty: reserved.toString(),
        updatedAt: new Date(),
      },
      tx,
    );

    logger.info(`✅ [InventoryMovementsRepository.reconcileSkuBalance] Reconciled ${movements.length} movements for SKU ${skuId}`);

    return {
      movementsFixed: movements.length,
      finalOnHandQty: onHand.toString(),
      finalLossQty: loss.toString(),
      finalReservedQty: reserved.toString(),
    };
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