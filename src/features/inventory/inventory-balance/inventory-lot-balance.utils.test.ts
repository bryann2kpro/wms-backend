import { describe, expect, test } from "vitest";
import {
  LOT_NO_LOT_KEY,
  aggregateStockQuantsByLot,
  inventoryLotBalanceId,
  normalizeLotNo,
  toLotKey,
} from "./inventory-lot-balance.utils";

describe("inventory-lot-balance.utils", () => {
  test("normalizeLotNo trims and coalesces null", () => {
    expect(normalizeLotNo(null)).toBe("");
    expect(normalizeLotNo("  LOT-A  ")).toBe("LOT-A");
    expect(normalizeLotNo("   ")).toBe("");
  });

  test("toLotKey maps empty lots to sentinel", () => {
    expect(toLotKey(null)).toBe(LOT_NO_LOT_KEY);
    expect(toLotKey("")).toBe(LOT_NO_LOT_KEY);
    expect(toLotKey("   ")).toBe(LOT_NO_LOT_KEY);
    expect(toLotKey(" BATCH-1 ")).toBe("BATCH-1");
  });

  test("aggregateStockQuantsByLot merges empty-lot rows per SKU", () => {
    const rows = aggregateStockQuantsByLot([
      { skuId: "sku-1", lotNo: null, quantity: "10" },
      { skuId: "sku-1", lotNo: "", quantity: "5" },
      { skuId: "sku-1", lotNo: "  ", quantity: "2" },
      { skuId: "sku-1", lotNo: "LOT-A", quantity: "3" },
      { skuId: "sku-1", lotNo: "LOT-A", quantity: "7" },
      { skuId: "sku-2", lotNo: "LOT-B", quantity: "4" },
    ]);

    expect(rows).toHaveLength(3);

    const noLot = rows.find((r) => r.lotKey === LOT_NO_LOT_KEY);
    expect(noLot).toMatchObject({
      skuId: "sku-1",
      lotNo: null,
      onHandQty: 17,
    });

    const lotA = rows.find((r) => r.lotKey === "LOT-A");
    expect(lotA).toMatchObject({
      skuId: "sku-1",
      lotNo: "LOT-A",
      onHandQty: 10,
    });

    const lotB = rows.find((r) => r.lotKey === "LOT-B");
    expect(lotB).toMatchObject({
      skuId: "sku-2",
      lotNo: "LOT-B",
      onHandQty: 4,
    });
  });

  test("inventoryLotBalanceId is stable composite key", () => {
    expect(inventoryLotBalanceId("sku-1", LOT_NO_LOT_KEY)).toBe(
      `sku-1:${LOT_NO_LOT_KEY}`,
    );
    expect(inventoryLotBalanceId("sku-1", "LOT-A")).toBe("sku-1:LOT-A");
  });
});
