/**
 * Executes rack-to-rack quantity move on stock_quant (same SKU).
 * Caller runs inside db.transaction when atomicity with putaway status is required.
 */

import type { DbTransaction } from "@/types/db-transaction";
import { StockQuantRepositoryClass } from "../stock-quant.repository";
import { StockQuantTransactionRepositoryClass } from "../stock-quant-transaction/stock-quant-transaction.repository";

const stockQuantRepository = new StockQuantRepositoryClass();
const stockQuantTransactionRepository = new StockQuantTransactionRepositoryClass();

export function roundQtyPutaway(n: number): number {
  return Math.round(n * 100) / 100;
}

export function qtyPutawayToDbString(n: number): string {
  return roundQtyPutaway(n).toFixed(2);
}

/** Returns trimmed lot number, or null when source has no lot recorded. */
export function normalizedPutawayLotNo(
  lot: string | null | undefined,
): string | null {
  const trimmed = (lot ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export function parsePutawayTransferQty(
  raw: string,
): { ok: true; value: number } | { ok: false; message: string } {
  const s = String(raw ?? "").trim();
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, message: "Quantity must be a positive number." };
  }
  return { ok: true, value: roundQtyPutaway(n) };
}

export type PutawayStockMoveParams = {
  tx: DbTransaction;
  organizationId: string;
  userId: string;
  sourceStockQuantId: string;
  destinationRackId: string;
  quantity: string;
};

export async function executePutawayStockQuantTransfer(
  params: PutawayStockMoveParams,
): Promise<{ success: boolean; message: string }> {
  const { tx, organizationId, userId, sourceStockQuantId, destinationRackId, quantity } = params;

  const source = await stockQuantRepository.getStockQuantById(
    organizationId,
    sourceStockQuantId,
    tx,
  );
  if (!source) {
    return {
      success: false,
      message:
        "No stock quant found for the source. It may have been removed or transferred already.",
    };
  }

  const parsed = parsePutawayTransferQty(quantity);
  if (!parsed.ok) {
    return { success: false, message: parsed.message };
  }

  const available = roundQtyPutaway(Number(source.quantity));
  if (!Number.isFinite(available)) {
    return {
      success: false,
      message: "Invalid on-hand quantity on the source stock quant.",
    };
  }

  if (parsed.value > available) {
    return {
      success: false,
      message: `Quantity exceeds available stock (${qtyPutawayToDbString(available)} on hand).`,
    };
  }

  if (destinationRackId === source.rackId) {
    return {
      success: false,
      message: "Destination rack must be different from the source rack.",
    };
  }

  const remaining = roundQtyPutaway(available - parsed.value);
  if (remaining <= 0) {
    await stockQuantRepository.deleteStockQuant(organizationId, source.id, tx);
  } else {
    await stockQuantRepository.updateStockQuant(
      organizationId,
      source.id,
      { quantity: qtyPutawayToDbString(remaining), updatedBy: userId },
      tx,
    );
  }

  const sourceLotNo = normalizedPutawayLotNo(source.lotNo);

  const destRow = await stockQuantRepository.getStockQuantBySkuRackAndLot(
    organizationId,
    source.skuId,
    destinationRackId,
    sourceLotNo,
    tx,
  );

  if (destRow) {
    const newDestQty = roundQtyPutaway(Number(destRow.quantity) + parsed.value);
    await stockQuantRepository.updateStockQuant(
      organizationId,
      destRow.id,
      {
        quantity: qtyPutawayToDbString(newDestQty),
        description: destRow.description ?? source.description,
        updatedBy: userId,
      },
      tx,
    );
  } else {
    await stockQuantRepository.createStockQuant(
      {
        skuId: source.skuId,
        lotNo: sourceLotNo,
        expiryDate: source.expiryDate ?? null,
        description: source.description ?? null,
        quantity: qtyPutawayToDbString(parsed.value),
        rackId: destinationRackId,
        organizationId,
        createdBy: userId,
        updatedBy: userId,
      },
      tx,
    );
  }

  await stockQuantTransactionRepository.createStockQuantTransaction(
    {
      skuId: source.skuId,
      lotNo: sourceLotNo,
      description: source.description ?? null,
      quantity: qtyPutawayToDbString(parsed.value),
      sourceRackId: source.rackId,
      destinationRackId: destinationRackId,
      type: "PUTAWAY",
      organizationId,
      createdBy: userId,
      updatedBy: userId,
    },
    tx,
  );

  return {
    success: true,
    message: `Transferred ${qtyPutawayToDbString(parsed.value)} units to the destination rack.`,
  };
}
