/**
 * Reserve / release / ship quantity on stock_quant rows for outbound POs.
 * Reservations are recorded in stock_quant_transaction (type PORESERVED).
 * Shipments are recorded in stock_quant_transaction (type POSHIPMENT) using
 * description = purchase order number; allocations follow the lot selected at PO creation.
 */

import type { DbTransaction } from "@/types/db-transaction";
import { logger } from "@/util/logger";
import { SkuRepositoryClass } from "../master-data/sku.repository";
import {
  StockQuantRepositoryClass,
  type StockQuantListType,
  type StockQuantType,
} from "./stock-quant.repository";
import { StockQuantTransactionRepositoryClass } from "./stock-quant-transaction/stock-quant-transaction.repository";
import {
  qtyPutawayToDbString,
  roundQtyPutaway,
} from "./putaway/putaway-stock-move.service";

/** Outbound PO reservation recorded on stock_quant_transaction. */
const PORESERVED_TYPE = "PORESERVED";
/** Outbound PO shipment recorded on stock_quant_transaction. */
const POSHIPMENT_TYPE = "POSHIPMENT";

const stockQuantRepository = new StockQuantRepositoryClass();
const stockQuantTransactionRepository = new StockQuantTransactionRepositoryClass();
const skuRepository = new SkuRepositoryClass();

export type StockQuantReservationLine = {
  skuId: string;
  qtyRequired: string | number;
  skuCode?: string;
  stockQuantId?: string;
};

function parseQty(v: string | number | null | undefined): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? roundQtyPutaway(n) : 0;
}

function availableOnRow(row: Pick<StockQuantType, "quantity" | "reservedQty">): number {
  return roundQtyPutaway(parseQty(row.quantity) - parseQty(row.reservedQty));
}

export function sortStockQuantsForPickingStrategy(
  rows: StockQuantListType[],
  strategy: string,
): StockQuantListType[] {
  const sorted = [...rows];
  const byUpdatedAt = (a: StockQuantListType, b: StockQuantListType, ascending: boolean) => {
    const diff =
      new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    return ascending ? diff : -diff;
  };

  switch (strategy) {
    case "LIFO":
      sorted.sort((a, b) => byUpdatedAt(a, b, false));
      break;
    case "FEFO":
      sorted.sort((a, b) => {
        const aExp = a.expiryDate
          ? new Date(a.expiryDate).getTime()
          : Number.MAX_SAFE_INTEGER;
        const bExp = b.expiryDate
          ? new Date(b.expiryDate).getTime()
          : Number.MAX_SAFE_INTEGER;
        return aExp - bExp;
      });
      break;
    default:
      sorted.sort((a, b) => byUpdatedAt(a, b, true));
      break;
  }
  return sorted;
}

async function getPickingStrategy(
  skuId: string,
  organizationId: string,
  tx?: DbTransaction,
): Promise<string> {
  const sku = await skuRepository.getSkuById(skuId, tx, organizationId);
  return sku?.pickingStrategy ?? "FIFO";
}

async function loadAvailableStockQuants(
  organizationId: string,
  skuId: string,
  tx: DbTransaction,
): Promise<StockQuantListType[]> {
  const rows = await stockQuantRepository.listStockQuantsBySkuId(
    organizationId,
    skuId,
    tx,
  );
  return rows.filter((row) => availableOnRow(row) > 0);
}

export async function getTotalAvailableStockQuantQty(
  organizationId: string,
  skuId: string,
  tx?: DbTransaction,
): Promise<number> {
  if (tx) {
    const rows = await loadAvailableStockQuants(organizationId, skuId, tx);
    return roundQtyPutaway(rows.reduce((sum, row) => sum + availableOnRow(row), 0));
  }
  const rows = await stockQuantRepository.listStockQuantsBySkuId(organizationId, skuId);
  return roundQtyPutaway(rows.reduce((sum, row) => sum + availableOnRow(row), 0));
}

export async function assertSufficientStockQuantForLines(
  organizationId: string,
  lines: StockQuantReservationLine[],
  tx: DbTransaction,
): Promise<void> {
  for (const line of lines) {
    const required = parseQty(line.qtyRequired);
    if (required <= 0) continue;
    const label = line.skuCode ?? line.skuId;

    if (line.stockQuantId) {
      const row = await stockQuantRepository.getStockQuantById(
        organizationId,
        line.stockQuantId,
        tx,
      );
      if (!row || row.skuId !== line.skuId) {
        throw new Error(`Selected stock quant batch is invalid for SKU "${label}".`);
      }
      const available = availableOnRow(row);
      if (available < required) {
        throw new Error(
          `Insufficient stock quant for SKU "${label}": required ${required}, available ${available} on selected batch.`,
        );
      }
      continue;
    }

    const available = await getTotalAvailableStockQuantQty(organizationId, line.skuId, tx);
    if (available < required) {
      throw new Error(
        `Insufficient stock quant for SKU "${label}": required ${required}, available ${available} at rack locations.`,
      );
    }
  }
}

async function applyStockQuantReservation(
  organizationId: string,
  userId: string,
  referenceNo: string,
  row: StockQuantType,
  qty: number,
  tx: DbTransaction,
): Promise<void> {
  const take = parseQty(qty);
  if (take <= 0) return;

  const available = availableOnRow(row);
  if (available < take) {
    throw new Error(
      `Insufficient stock quant on selected batch: required ${take}, available ${available}.`,
    );
  }

  const newReserved = roundQtyPutaway(parseQty(row.reservedQty) + take);
  await stockQuantRepository.updateStockQuant(
    organizationId,
    row.id,
    {
      reservedQty: qtyPutawayToDbString(newReserved),
      updatedBy: userId,
    },
    tx,
  );

  await stockQuantTransactionRepository.createStockQuantTransaction(
    {
      skuId: row.skuId,
      lotNo: row.lotNo?.trim() ? row.lotNo.trim() : null,
      expiryDate: row.expiryDate ?? null,
      description: referenceNo,
      quantity: qtyPutawayToDbString(take),
      sourceRackId: row.rackId,
      destinationRackId: null,
      type: PORESERVED_TYPE,
      organizationId,
      createdBy: userId,
      updatedBy: userId,
    },
    tx,
  );
}

export async function reserveStockQuantForPurchaseOrderLine(params: {
  organizationId: string;
  userId: string;
  referenceNo: string;
  skuId: string;
  skuCode?: string;
  qtyRequired: string | number;
  stockQuantId?: string;
  tx: DbTransaction;
}): Promise<void> {
  const { organizationId, userId, referenceNo, skuId, skuCode, qtyRequired, stockQuantId, tx } =
    params;
  const required = parseQty(qtyRequired);
  if (required <= 0) return;

  if (stockQuantId) {
    const row = await stockQuantRepository.getStockQuantById(
      organizationId,
      stockQuantId,
      tx,
    );
    if (!row || row.skuId !== skuId) {
      const label = skuCode ?? skuId;
      throw new Error(`Selected stock quant batch is invalid for SKU "${label}".`);
    }
    await applyStockQuantReservation(
      organizationId,
      userId,
      referenceNo,
      row,
      required,
      tx,
    );
    return;
  }

  let remaining = required;
  const strategy = await getPickingStrategy(skuId, organizationId, tx);
  const rows = sortStockQuantsForPickingStrategy(
    await loadAvailableStockQuants(organizationId, skuId, tx),
    strategy,
  );

  for (const row of rows) {
    if (remaining <= 0) break;

    const available = availableOnRow(row);
    if (available <= 0) continue;

    const take = roundQtyPutaway(Math.min(remaining, available));
    await applyStockQuantReservation(
      organizationId,
      userId,
      referenceNo,
      row,
      take,
      tx,
    );
    remaining = roundQtyPutaway(remaining - take);
  }

  if (remaining > 0) {
    const label = skuCode ?? skuId;
    throw new Error(
      `Insufficient stock quant for SKU "${label}": could not allocate ${remaining} more unit(s).`,
    );
  }
}

export async function releaseStockQuantForPurchaseOrder(params: {
  organizationId: string;
  userId: string;
  referenceNo: string;
  skuId?: string;
  tx: DbTransaction;
}): Promise<void> {
  const { organizationId, userId, referenceNo, skuId, tx } = params;

  const allocations = await stockQuantTransactionRepository.findByReferenceAndType(
    organizationId,
    referenceNo,
    PORESERVED_TYPE,
    skuId,
    tx,
  );

  for (const allocation of allocations) {
    const qty = parseQty(allocation.quantity);
    if (qty <= 0) continue;

    const stockRow = await stockQuantRepository.getStockQuantByRackSkuLotAndExpiry(
      organizationId,
      allocation.sourceRackId,
      allocation.skuId,
      allocation.lotNo,
      allocation.expiryDate,
      tx,
    );

    if (stockRow) {
      const newReserved = Math.max(
        0,
        roundQtyPutaway(parseQty(stockRow.reservedQty) - qty),
      );
      await stockQuantRepository.updateStockQuant(
        organizationId,
        stockRow.id,
        {
          reservedQty: qtyPutawayToDbString(newReserved),
          updatedBy: userId,
        },
        tx,
      );
    } else {
      logger.warn(
        "[releaseStockQuantForPurchaseOrder] stock_quant row not found for allocation",
        { referenceNo, allocationId: allocation.id },
      );
    }

    await stockQuantTransactionRepository.deleteStockQuantTransaction(
      organizationId,
      allocation.id,
      tx,
    );
  }
}

export async function releaseStockQuantPartialForSku(params: {
  organizationId: string;
  userId: string;
  referenceNo: string;
  skuId: string;
  qtyToRelease: string | number;
  tx: DbTransaction;
}): Promise<void> {
  let remaining = parseQty(params.qtyToRelease);
  if (remaining <= 0) return;

  const allocations = await stockQuantTransactionRepository.findByReferenceAndType(
    params.organizationId,
    params.referenceNo,
    PORESERVED_TYPE,
    params.skuId,
    params.tx,
  );

  // Release in reverse allocation order (LIFO on PO reservations).
  for (const allocation of [...allocations].reverse()) {
    if (remaining <= 0) break;

    const allocated = parseQty(allocation.quantity);
    if (allocated <= 0) continue;

    const releaseQty = roundQtyPutaway(Math.min(remaining, allocated));

    const stockRow = await stockQuantRepository.getStockQuantByRackSkuLotAndExpiry(
      params.organizationId,
      allocation.sourceRackId,
      allocation.skuId,
      allocation.lotNo,
      allocation.expiryDate,
      params.tx,
    );

    if (stockRow) {
      const newReserved = Math.max(
        0,
        roundQtyPutaway(parseQty(stockRow.reservedQty) - releaseQty),
      );
      await stockQuantRepository.updateStockQuant(
        params.organizationId,
        stockRow.id,
        {
          reservedQty: qtyPutawayToDbString(newReserved),
          updatedBy: params.userId,
        },
        params.tx,
      );
    }

    const newAllocated = roundQtyPutaway(allocated - releaseQty);
    if (newAllocated <= 0) {
      await stockQuantTransactionRepository.deleteStockQuantTransaction(
        params.organizationId,
        allocation.id,
        params.tx,
      );
    } else {
      await stockQuantTransactionRepository.updateStockQuantTransaction(
        params.organizationId,
        allocation.id,
        {
          quantity: qtyPutawayToDbString(newAllocated),
          updatedBy: params.userId,
        },
        params.tx,
      );
    }

    remaining = roundQtyPutaway(remaining - releaseQty);
  }

  if (remaining > 0) {
    logger.warn(
      "[releaseStockQuantPartialForSku] could not release full quantity from PO allocations",
      {
        referenceNo: params.referenceNo,
        skuId: params.skuId,
        remaining,
      },
    );
  }
}

export async function shipStockQuantForPurchaseOrder(params: {
  organizationId: string;
  userId: string;
  referenceNo: string;
  tx: DbTransaction;
}): Promise<void> {
  const { organizationId, userId, referenceNo, tx } = params;

  const allocations = await stockQuantTransactionRepository.findByReferenceAndType(
    organizationId,
    referenceNo,
    PORESERVED_TYPE,
    undefined,
    tx,
  );

  for (const allocation of allocations) {
    const qty = parseQty(allocation.quantity);
    if (qty <= 0) continue;

    const stockRow = await stockQuantRepository.getStockQuantByRackSkuLotAndExpiry(
      organizationId,
      allocation.sourceRackId,
      allocation.skuId,
      allocation.lotNo,
      allocation.expiryDate,
      tx,
    );

    if (!stockRow) {
      throw new Error(
        `Stock quant batch not found for PO "${referenceNo}" shipment (SKU ${allocation.skuId}).`,
      );
    }

    const onHand = parseQty(stockRow.quantity);
    const reserved = parseQty(stockRow.reservedQty);
    if (onHand < qty) {
      throw new Error(
        `Insufficient on-hand stock quant for PO "${referenceNo}" shipment: required ${qty}, on hand ${onHand}.`,
      );
    }
    if (reserved < qty) {
      throw new Error(
        `Insufficient reserved stock quant for PO "${referenceNo}" shipment: required ${qty}, reserved ${reserved}.`,
      );
    }

    const newOnHand = roundQtyPutaway(onHand - qty);
    const newReserved = roundQtyPutaway(reserved - qty);
    await stockQuantRepository.updateStockQuant(
      organizationId,
      stockRow.id,
      {
        quantity: qtyPutawayToDbString(newOnHand),
        reservedQty: qtyPutawayToDbString(newReserved),
        updatedBy: userId,
      },
      tx,
    );

    await stockQuantTransactionRepository.createStockQuantTransaction(
      {
        skuId: allocation.skuId,
        lotNo: allocation.lotNo?.trim() ? allocation.lotNo.trim() : null,
        expiryDate: allocation.expiryDate ?? null,
        description: referenceNo,
        quantity: qtyPutawayToDbString(qty),
        sourceRackId: allocation.sourceRackId,
        destinationRackId: null,
        type: POSHIPMENT_TYPE,
        organizationId,
        createdBy: userId,
        updatedBy: userId,
      },
      tx,
    );

    await stockQuantTransactionRepository.deleteStockQuantTransaction(
      organizationId,
      allocation.id,
      tx,
    );
  }
}
