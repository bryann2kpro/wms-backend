/**
 * Stock Balance Excel Sync
 *
 * @description Syncs the warehouse's daily stock balance Excel (one row per
 * bin + SKU + expiry batch) into stock_quant and inventory_balances.
 * - stock_quant rows are upserted per (sku, rack, expiry); rows not present in
 *   the file are zeroed (not deleted, to preserve FK references from open DO items).
 * - inventory_balances.on_hand_qty is set to the file total per SKU, and the
 *   delta is logged to inventory_movements as an ADJUSTMENT so the movement
 *   cross-check report stays consistent.
 * - Open (unshipped) delivery order items whose selected batch no longer covers
 *   their quantity are reassigned to the first FIFO batch that does.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { logger } from "@/util/logger";
import { StockQuantTable } from "./stock-quant.model";
import { SkuTable } from "@/features/master-data/sku.model";
import { RacksTable } from "@/features/master-data/racks.model";
import { InventoryBalancesTable } from "@/features/inventory/inventory-balance/inventory.model";
import {
  InventoryMovementsTable,
  InventoryMovementType,
} from "@/features/inventory/inventory-movement/inventory.model";
import {
  DeliveryOrderItemsTable,
  DeliveryOrdersTable,
} from "@/features/outbound/delivery-orders.model";

export type StockBalanceSyncRowInput = {
  binCode: string;
  skuCode: string;
  /** ISO date string or null when the file has no/epoch expiry. */
  expiryDate: string | null;
  qty: number;
  description?: string | null;
};

export type StockBalanceSyncSkippedRow = {
  binCode: string;
  skuCode: string;
  reason: string;
};

export type StockBalanceSyncResult = {
  updated: number;
  inserted: number;
  zeroed: number;
  balancesUpdated: number;
  reassignedDoItems: number;
  skipped: StockBalanceSyncSkippedRow[];
};

/** Normalize SKU codes for matching: the file may write "RAW-E0010 (F)" while master data has "RAW-E0010(F)". */
function normalizeSkuCode(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase();
}

/** Compare expiry values on date precision (the file carries dates, not times). */
function dateOnly(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** DO statuses whose picklist assignments must stay valid after a sync. */
const OPEN_DO_STATUSES = ["CREATED", "NEW", "PICKING", "PACKING"];

export async function syncStockBalance(
  organizationId: string,
  userId: string,
  rows: StockBalanceSyncRowInput[],
): Promise<StockBalanceSyncResult> {
  logger.info(
    `ℹ️ [syncStockBalance] Syncing ${rows.length} rows from stock balance file...`,
  );

  const result: StockBalanceSyncResult = {
    updated: 0,
    inserted: 0,
    zeroed: 0,
    balancesUpdated: 0,
    reassignedDoItems: 0,
    skipped: [],
  };

  await db.transaction(async (tx) => {
    // --- Resolve master data ---
    const skus = await tx
      .select({ skuId: SkuTable.skuId, skuCode: SkuTable.skuCode })
      .from(SkuTable);
    const skuByCode = new Map(
      skus.map((s) => [normalizeSkuCode(s.skuCode), s.skuId]),
    );

    const racks = await tx
      .select({
        rackId: RacksTable.rackId,
        label: sql<string>`CONCAT(${RacksTable.rackRow}, '-', ${RacksTable.rackLevel}, '-', ${RacksTable.rackColumn})`,
      })
      .from(RacksTable)
      .where(eq(RacksTable.organizationId, organizationId));
    const rackByLabel = new Map(racks.map((r) => [r.label.toUpperCase(), r.rackId]));

    // --- Validate rows; merge duplicates on (sku, rack, expiry) ---
    type MergedRow = {
      skuId: string;
      rackId: string;
      expiryDate: Date | null;
      qty: number;
      description: string | null;
    };
    const mergedByKey = new Map<string, MergedRow>();
    const skuTotals = new Map<string, number>();

    for (const row of rows) {
      const skuId = skuByCode.get(normalizeSkuCode(row.skuCode));
      if (!skuId) {
        result.skipped.push({
          binCode: row.binCode,
          skuCode: row.skuCode,
          reason: `SKU "${row.skuCode}" not found in master data`,
        });
        continue;
      }
      const rackId = rackByLabel.get(row.binCode.trim().toUpperCase());
      if (!rackId) {
        result.skipped.push({
          binCode: row.binCode,
          skuCode: row.skuCode,
          reason: `Rack "${row.binCode}" not found in master data`,
        });
        continue;
      }
      const qty = Number(row.qty);
      if (!Number.isFinite(qty) || qty < 0) {
        result.skipped.push({
          binCode: row.binCode,
          skuCode: row.skuCode,
          reason: `Invalid quantity "${row.qty}"`,
        });
        continue;
      }

      const expiry = row.expiryDate ? new Date(row.expiryDate) : null;
      const key = `${skuId}|${rackId}|${dateOnly(expiry) ?? "none"}`;
      const existing = mergedByKey.get(key);
      if (existing) {
        existing.qty += qty;
      } else {
        mergedByKey.set(key, {
          skuId,
          rackId,
          expiryDate: expiry,
          qty,
          description: row.description ?? null,
        });
      }
      skuTotals.set(skuId, (skuTotals.get(skuId) ?? 0) + qty);
    }

    const affectedSkuIds = [...skuTotals.keys()];
    if (affectedSkuIds.length === 0) return;

    // --- Upsert stock_quant per SKU ---
    const existingQuants = await tx
      .select()
      .from(StockQuantTable)
      .where(
        and(
          eq(StockQuantTable.organizationId, organizationId),
          inArray(StockQuantTable.skuId, affectedSkuIds),
        ),
      );

    const matchedQuantIds = new Set<string>();
    for (const merged of mergedByKey.values()) {
      const match = existingQuants.find(
        (q) =>
          !matchedQuantIds.has(q.id) &&
          q.skuId === merged.skuId &&
          q.rackId === merged.rackId &&
          dateOnly(q.expiryDate) === dateOnly(merged.expiryDate),
      );
      if (match) {
        matchedQuantIds.add(match.id);
        if (Number(match.quantity) !== merged.qty) {
          await tx
            .update(StockQuantTable)
            .set({
              quantity: merged.qty.toFixed(2),
              updatedAt: new Date(),
              updatedBy: userId,
            })
            .where(eq(StockQuantTable.id, match.id));
          result.updated++;
        }
      } else {
        await tx.insert(StockQuantTable).values({
          skuId: merged.skuId,
          rackId: merged.rackId,
          expiryDate: merged.expiryDate,
          description: merged.description,
          quantity: merged.qty.toFixed(2),
          reservedQty: "0",
          lossQty: "0",
          organizationId,
          createdBy: userId,
          updatedBy: userId,
        });
        result.inserted++;
      }
    }

    // Zero out rows the file no longer lists (keep the row: open DO items may reference it)
    for (const quant of existingQuants) {
      if (!matchedQuantIds.has(quant.id) && Number(quant.quantity) !== 0) {
        await tx
          .update(StockQuantTable)
          .set({ quantity: "0", updatedAt: new Date(), updatedBy: userId })
          .where(eq(StockQuantTable.id, quant.id));
        result.zeroed++;
      }
    }

    // --- Sync inventory_balances + log ADJUSTMENT movements ---
    const referenceNo = `EXCEL-SYNC-${new Date().toISOString().slice(0, 10)}`;
    for (const [skuId, newTotal] of skuTotals.entries()) {
      const [balance] = await tx
        .select()
        .from(InventoryBalancesTable)
        .where(
          and(
            eq(InventoryBalancesTable.organizationId, organizationId),
            eq(InventoryBalancesTable.skuId, skuId),
          ),
        )
        .limit(1);

      const oldOnHand = balance ? Number(balance.onHandQty) : 0;
      const delta = newTotal - oldOnHand;

      if (balance) {
        if (delta !== 0) {
          await tx
            .update(InventoryBalancesTable)
            .set({ onHandQty: newTotal.toFixed(2), updatedAt: new Date() })
            .where(eq(InventoryBalancesTable.id, balance.id));
          result.balancesUpdated++;
        }
      } else {
        await tx.insert(InventoryBalancesTable).values({
          organizationId,
          skuId,
          onHandQty: newTotal.toFixed(2),
          reservedQty: "0",
          lossQty: "0",
        });
        result.balancesUpdated++;
      }

      if (delta !== 0) {
        await tx.insert(InventoryMovementsTable).values({
          skuId,
          movementType: InventoryMovementType.ADJUSTMENT,
          quantity: delta.toFixed(2),
          balanceAfter: newTotal.toFixed(2),
          referenceNo,
          reason: "Warehouse stock balance Excel sync",
          createdBy: userId,
        });
      }
    }

    // --- Re-validate open DO picklist assignments ---
    const openItems = await tx
      .select({
        id: DeliveryOrderItemsTable.id,
        skuId: DeliveryOrderItemsTable.skuId,
        qtyRequired: DeliveryOrderItemsTable.qtyRequired,
        stockQuantId: DeliveryOrderItemsTable.stockQuantId,
      })
      .from(DeliveryOrderItemsTable)
      .innerJoin(
        DeliveryOrdersTable,
        eq(DeliveryOrdersTable.purchaseOrderId, DeliveryOrderItemsTable.purchaseOrderId),
      )
      .where(
        and(
          inArray(DeliveryOrdersTable.status, OPEN_DO_STATUSES),
          inArray(DeliveryOrderItemsTable.skuId, affectedSkuIds),
        ),
      );

    for (const item of openItems) {
      if (!item.stockQuantId) continue;
      const required = Number(item.qtyRequired);

      const [currentBatch] = await tx
        .select({ quantity: StockQuantTable.quantity })
        .from(StockQuantTable)
        .where(eq(StockQuantTable.id, item.stockQuantId))
        .limit(1);
      if (currentBatch && Number(currentBatch.quantity) >= required) continue;

      // Reassign: first FIFO batch (expiry ASC NULLS LAST, qty ASC, rack ASC) that covers the line
      const [replacement] = await tx
        .select({ id: StockQuantTable.id })
        .from(StockQuantTable)
        .innerJoin(RacksTable, eq(RacksTable.rackId, StockQuantTable.rackId))
        .where(
          and(
            eq(StockQuantTable.organizationId, organizationId),
            eq(StockQuantTable.skuId, item.skuId),
            sql`${StockQuantTable.quantity} >= ${required}`,
          ),
        )
        .orderBy(
          sql`${StockQuantTable.expiryDate} ASC NULLS LAST`,
          sql`${StockQuantTable.quantity} ASC`,
          sql`CONCAT(${RacksTable.rackRow}, '-', ${RacksTable.rackLevel}, '-', ${RacksTable.rackColumn}) ASC`,
        )
        .limit(1);

      if (replacement && replacement.id !== item.stockQuantId) {
        await tx
          .update(DeliveryOrderItemsTable)
          .set({
            stockQuantId: replacement.id,
            updatedAt: new Date(),
            updatedBy: userId,
          })
          .where(eq(DeliveryOrderItemsTable.id, item.id));
        result.reassignedDoItems++;
      }
    }
  });

  logger.info(
    `✅ [syncStockBalance] Done: ${result.updated} updated, ${result.inserted} inserted, ${result.zeroed} zeroed, ${result.balancesUpdated} balances, ${result.reassignedDoItems} DO items reassigned, ${result.skipped.length} skipped`,
  );
  return result;
}
