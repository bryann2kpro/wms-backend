/**
 * Records stock_quant rows when a GRN is approved.
 * Upsert key: rack → sku → lot (optional) → expiry (optional).
 * When all match, quantity is added; otherwise a new row is created.
 */

import type { DbTransaction } from "@/types/db-transaction";
import { logger } from "@/util/logger";
import { SkuRepositoryClass } from "../master-data/sku.repository";
import { StockQuantRepositoryClass } from "../stock-quant/stock-quant.repository";
import {
  normalizedPutawayLotNo,
  qtyPutawayToDbString,
  roundQtyPutaway,
} from "../stock-quant/putaway/putaway-stock-move.service";
import type { GrnItemsType } from "./grns-items.repository";

const stockQuantRepository = new StockQuantRepositoryClass();
const skuRepository = new SkuRepositoryClass();

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

  for (const item of items) {
    const rackId = (item.rackId ?? "").trim();
    if (!rackId) {
      logger.warn(
        "[recordGrnApprovalStockQuants] Skipping GRN item without rackId",
        { grnItemId: item.id, skuId: item.skuId },
      );
      continue;
    }

    const grossQty = Number(item.qty ?? 0);
    const lossQty = Number(item.lossQty ?? 0);
    const netQty = roundQtyPutaway(grossQty - lossQty);
    if (!Number.isFinite(netQty) || netQty <= 0) {
      continue;
    }

    const lotNo = normalizedPutawayLotNo(item.lotNo);
    const expiryDate = item.expiryDate ?? null;
    const qtyStr = qtyPutawayToDbString(netQty);
    const description = skuDescriptionById.get(item.skuId) ?? null;

    const existing = await stockQuantRepository.getStockQuantByRackSkuLotAndExpiry(
      organizationId,
      rackId,
      item.skuId,
      lotNo,
      expiryDate,
      tx,
    );

    if (existing) {
      const newQty = roundQtyPutaway(Number(existing.quantity) + netQty);
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
      continue;
    }

    await stockQuantRepository.createStockQuant(
      {
        skuId: item.skuId,
        rackId,
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
}
