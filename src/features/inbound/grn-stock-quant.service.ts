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
import { GrnItemRacksTable } from "./grns.model";
import {
  grnItemNetQty,
  resolveGrnItemRackAllocations,
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
}
