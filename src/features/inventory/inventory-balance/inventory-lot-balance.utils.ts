/** Sentinel lotKey for stock_quant rows with null/empty/whitespace lot_no. */
export const LOT_NO_LOT_KEY = "__no_lot__";

export function normalizeLotNo(lot: string | null | undefined): string {
  return (lot ?? "").trim();
}

/** Maps lot_no to a stable grouping key; empty lots merge under LOT_NO_LOT_KEY. */
export function toLotKey(lot: string | null | undefined): string {
  const normalized = normalizeLotNo(lot);
  return normalized === "" ? LOT_NO_LOT_KEY : normalized;
}

export function lotNoFromLotKey(lotKey: string): string | null {
  return lotKey === LOT_NO_LOT_KEY ? null : lotKey;
}

export type StockQuantLotAggregateInput = {
  skuId: string;
  lotNo: string | null | undefined;
  quantity: string | number;
};

export type StockQuantLotAggregateRow = {
  skuId: string;
  lotKey: string;
  lotNo: string | null;
  onHandQty: number;
};

/**
 * In-memory aggregation mirroring server GROUP BY (skuId, lotKey).
 * Rows without lot merge into one line per SKU.
 */
export function aggregateStockQuantsByLot(
  rows: StockQuantLotAggregateInput[],
): StockQuantLotAggregateRow[] {
  const map = new Map<string, StockQuantLotAggregateRow>();

  for (const row of rows) {
    const lotKey = toLotKey(row.lotNo);
    const lotNo = lotNoFromLotKey(lotKey);
    const key = `${row.skuId}:${lotKey}`;
    const qty = Number(row.quantity ?? 0);

    const existing = map.get(key);
    if (existing) {
      existing.onHandQty += qty;
    } else {
      map.set(key, { skuId: row.skuId, lotKey, lotNo, onHandQty: qty });
    }
  }

  return [...map.values()];
}

export function inventoryLotBalanceId(skuId: string, lotKey: string): string {
  return `${skuId}:${lotKey}`;
}
