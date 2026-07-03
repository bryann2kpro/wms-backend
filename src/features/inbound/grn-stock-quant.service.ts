/**
 * Records stock_quant rows and INBOUND stock_quant_transaction rows when a GRN is approved.
 * Uses grn_item_racks allocations when present; otherwise falls back to grn_items.rackId + full net qty.
 */

import { inArray } from "drizzle-orm";
import type { DbTransaction } from "@/types/db-transaction";
import { logger } from "@/util/logger";
import { SkuRepositoryClass } from "../master-data/sku.repository";
import { StockQuantRepositoryClass } from "../stock-quant/stock-quant.repository";
import { StockQuantTransactionRepositoryClass } from "../stock-quant/stock-quant-transaction/stock-quant-transaction.repository";
import {
  normalizedPutawayLotNo,
  qtyPutawayToDbString,
  roundQtyPutaway,
} from "../stock-quant/putaway/putaway-stock-move.service";
import type { GrnItemsType } from "./grns-items.repository";
import { GrnItemRacksTable, GrnItemLossRacksTable } from "./grns.model";
import {
  grnItemNetQty,
  grnItemLossQty,
  resolveGrnItemRackAllocations,
  resolveGrnItemLossRackAllocations,
  type ResolvedGrnRackAllocation,
} from "./grn-rack-allocation.util";

const stockQuantRepository = new StockQuantRepositoryClass();
const stockQuantTransactionRepository = new StockQuantTransactionRepositoryClass();
const skuRepository = new SkuRepositoryClass();

async function loadGrnItemRackAllocations(
  items: GrnItemsType[],
  tx: DbTransaction,
): Promise<Map<string, ResolvedGrnRackAllocation[]>> {
  const map = new Map<string, ResolvedGrnRackAllocation[]>();
  const grnItemIds = items.map((item) => item.id);
  if (grnItemIds.length === 0) return map;

  const rows = await tx
    .select({
      grnItemId: GrnItemRacksTable.grnItemId,
      rackId: GrnItemRacksTable.rackId,
    })
    .from(GrnItemRacksTable)
    .where(inArray(GrnItemRacksTable.grnItemId, grnItemIds));

  const rackIdsByItemId = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.rackId) continue;
    const current = rackIdsByItemId.get(row.grnItemId) ?? [];
    current.push(row.rackId);
    rackIdsByItemId.set(row.grnItemId, current);
  }

  for (const item of items) {
    const rackIds = rackIdsByItemId.get(item.id) ?? [];
    if (rackIds.length === 0) continue;
    const allocations = resolveGrnItemRackAllocations({
      qty: item.qty,
      lossQty: item.lossQty,
      rackIds,
    });
    if (allocations.length > 0) {
      map.set(item.id, allocations);
    }
  }

  return map;
}

async function loadGrnItemLossRackAllocations(
  items: GrnItemsType[],
  tx: DbTransaction,
): Promise<Map<string, ResolvedGrnRackAllocation[]>> {
  const map = new Map<string, ResolvedGrnRackAllocation[]>();
  const grnItemIds = items.map((item) => item.id);
  if (grnItemIds.length === 0) return map;

  const rows = await tx
    .select({
      grnItemId: GrnItemLossRacksTable.grnItemId,
      rackId: GrnItemLossRacksTable.rackId,
      quantity: GrnItemLossRacksTable.quantity,
    })
    .from(GrnItemLossRacksTable)
    .where(inArray(GrnItemLossRacksTable.grnItemId, grnItemIds));

  const rowsByItemId = new Map<string, Array<{ rackId: string; quantity: string }>>();
  for (const row of rows) {
    if (!row.rackId) continue;
    const current = rowsByItemId.get(row.grnItemId) ?? [];
    current.push({ rackId: row.rackId, quantity: row.quantity });
    rowsByItemId.set(row.grnItemId, current);
  }

  for (const item of items) {
    const links = rowsByItemId.get(item.id) ?? [];
    if (links.length === 0) continue;
    const hasQuantities = links.every((link) => roundQtyPutaway(Number(link.quantity)) > 0);
    const allocations = hasQuantities
      ? links.map((link) => ({
          rackId: link.rackId,
          quantity: roundQtyPutaway(Number(link.quantity)),
          quantityStr: link.quantity,
        }))
      : resolveGrnItemLossRackAllocations({
          qty: item.qty,
          lossQty: item.lossQty,
          lossRackId: links[0]?.rackId ?? null,
        });
    if (allocations.length > 0) {
      map.set(item.id, allocations);
    }
  }

  return map;
}

export async function recordGrnApprovalStockQuants(params: {
  organizationId: string;
  userId: string;
  items: GrnItemsType[];
  tx: DbTransaction;
}): Promise<void> {
  const { organizationId, userId, items, tx } = params;

  const skuIds = [...new Set(items.map((item) => item.skuId).filter(Boolean))];
  const skuDescriptionById = new Map<string, string>();
  if (skuIds.length > 0) {
    const skuResult = await skuRepository.getSku(
      { skuId: skuIds },
      undefined,
      tx,
      organizationId,
    );
    for (const sku of skuResult.query ?? []) {
      skuDescriptionById.set(sku.skuId, sku.skuDescription);
    }
  }

  const allocationsByItemId = await loadGrnItemRackAllocations(items, tx);
  const lossAllocationsByItemId = await loadGrnItemLossRackAllocations(items, tx);

  for (const item of items) {
    const netQty = grnItemNetQty(item);
    if (netQty <= 0) continue;

    let allocations = allocationsByItemId.get(item.id) ?? [];
    if (allocations.length === 0) {
      const rackId = (item.rackId ?? "").trim();
      if (!rackId) {
        logger.warn(
          "[recordGrnApprovalStockQuants] Skipping GRN item without rack allocation",
          { grnItemId: item.id, skuId: item.skuId },
        );
        continue;
      }
      allocations = [
        {
          rackId,
          quantity: netQty,
          quantityStr: String(netQty),
        },
      ];
    }

    const lotNo = normalizedPutawayLotNo(item.lotNo);
    const expiryDate = item.expiryDate ?? null;
    const description = skuDescriptionById.get(item.skuId) ?? null;

    for (const allocation of allocations) {
      const qtyStr = qtyPutawayToDbString(allocation.quantity);

      const existing = await stockQuantRepository.getStockQuantByRackSkuLotAndExpiry(
        organizationId,
        allocation.rackId,
        item.skuId,
        lotNo,
        expiryDate,
        tx,
      );

      if (existing) {
        const newQty = roundQtyPutaway(Number(existing.quantity) + allocation.quantity);
        await stockQuantRepository.updateStockQuant(
          organizationId,
          existing.id,
          {
            quantity: qtyPutawayToDbString(newQty),
            description: description ?? existing.description,
            updatedBy: userId,
          },
          tx,
        );
      } else {
        await stockQuantRepository.createStockQuant(
          {
            skuId: item.skuId,
            rackId: allocation.rackId,
            lotNo,
            expiryDate,
            description,
            quantity: qtyStr,
            organizationId,
            createdBy: userId,
            updatedBy: userId,
          },
          tx,
        );
      }

      await stockQuantTransactionRepository.createStockQuantTransaction(
        {
          skuId: item.skuId,
          lotNo,
          description,
          quantity: qtyStr,
          sourceRackId: allocation.rackId,
          destinationRackId: null,
          type: "INBOUND",
          organizationId,
          createdBy: userId,
          updatedBy: userId,
        },
        tx,
      );
    }
  }

  // Loss qty: record at the loss rack(s) (LOOSE_STORAGE bin) separately from regular allocations.
  for (const item of items) {
    const lossQty = grnItemLossQty(item);
    if (lossQty <= 0) continue;

    let lossAllocations = lossAllocationsByItemId.get(item.id) ?? [];
    if (lossAllocations.length === 0) {
      const lossRackId = (item.lossRackId ?? "").trim();
      if (!lossRackId) {
        logger.warn(
          "[recordGrnApprovalStockQuants] Skipping loss qty — no loss rack assigned",
          { grnItemId: item.id, skuId: item.skuId, lossQty },
        );
        continue;
      }
      lossAllocations = [
        { rackId: lossRackId, quantity: lossQty, quantityStr: String(lossQty) },
      ];
    }

    const lotNo = normalizedPutawayLotNo(item.lotNo);
    const expiryDate = item.expiryDate ?? null;
    const description = skuDescriptionById.get(item.skuId) ?? null;

    for (const allocation of lossAllocations) {
      const lossQtyStr = qtyPutawayToDbString(allocation.quantity);

      const existingLoss = await stockQuantRepository.getStockQuantByRackSkuLotAndExpiry(
        organizationId,
        allocation.rackId,
        item.skuId,
        lotNo,
        expiryDate,
        tx,
      );

      if (existingLoss) {
        const newQty = roundQtyPutaway(Number(existingLoss.quantity) + allocation.quantity);
        await stockQuantRepository.updateStockQuant(
          organizationId,
          existingLoss.id,
          {
            quantity: qtyPutawayToDbString(newQty),
            description: description ?? existingLoss.description,
            updatedBy: userId,
          },
          tx,
        );
      } else {
        await stockQuantRepository.createStockQuant(
          {
            skuId: item.skuId,
            rackId: allocation.rackId,
            lotNo,
            expiryDate,
            description,
            quantity: lossQtyStr,
            organizationId,
            createdBy: userId,
            updatedBy: userId,
          },
          tx,
        );
      }

      await stockQuantTransactionRepository.createStockQuantTransaction(
        {
          skuId: item.skuId,
          lotNo,
          description,
          quantity: lossQtyStr,
          sourceRackId: allocation.rackId,
          destinationRackId: null,
          type: "INBOUND",
          organizationId,
          createdBy: userId,
          updatedBy: userId,
        },
        tx,
      );
    }
  }
}
