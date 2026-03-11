import { logger } from "@/util/logger";
import { PaginationParams } from "../rbac/rbac.model";
import { StockCountFilter, StockCountServices } from "./stock-count.services";

type StockCountRow = {
  skuId: string;
  skuCode: string;
  skuDescription: string;
  openingQty: string | number | null;
  openingLossQty: string | number | null;
  onHandQty: string | number | null;
  reservedQty: string | number | null;
  lossQty: string | number | null;
  skuExpiryDate: Date | string | null;
  qtyDifference: string | number | null;
  lossQtyDifference: string | number | null;
};

function toFloat(value: string | number | null | undefined) {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function toIsoDate(value: Date | string | null | undefined) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function transformStockCount(row: StockCountRow) {
  return {
    skuId: row.skuId,
    skuCode: row.skuCode,
    skuDescription: row.skuDescription,
    openingQty: toFloat(row.openingQty),
    openingLossQty: toFloat(row.openingLossQty),
    onHandQty: toFloat(row.onHandQty),
    reservedQty: toFloat(row.reservedQty),
    lossQty: toFloat(row.lossQty),
    skuExpiryDate: toIsoDate(row.skuExpiryDate),
    qtyDifference: toFloat(row.qtyDifference),
    lossQtyDifference: toFloat(row.lossQtyDifference),
  };
}

const stockCountServices = new StockCountServices();

export const resolvers = {
  Query: {
    stockCounts: async (
      _: unknown,
      args: {
        filter?: StockCountFilter;
        pageSize?: number;
        pageNumber?: number;
      }
    ) => {
      try {
        const paginationParams: PaginationParams = {
          pageSize: args.pageSize,
          pageNumber: args.pageNumber,
        };

        const result = await stockCountServices.getStockCount(
          args.filter ?? {},
          paginationParams
        );

        return {
          query: (result.query as StockCountRow[]).map(transformStockCount),
          pagination: result.pagination,
        };
      } catch (error) {
        logger.error("[stock-count.resolver] Error:", error);
        throw error;
      }
    },
  },
};
