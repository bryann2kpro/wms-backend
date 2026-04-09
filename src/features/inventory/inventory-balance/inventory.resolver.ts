/**
 * Inventory Balance GraphQL Resolvers
 *
 * @description Resolver functions for inventory balance operations.
 * Uses InventoryBalancesRepository for data access.
 */

import { inventoryBalancesRepository } from "@/composition-root";
import { InventoryBalancesFilter } from "./inventory.repository";

export type InventoryBalanceFilterArgs = {
  skuId?: string;
  skuIds?: string[];
  skuCode?: string;
  skuCodes?: string[];
  search?: string;
  recordedDate?: string;
};

function transformInventoryBalance(row: {
  id: string;
  skuId: string;
  onHandQty: string | number;
  lossQty: string | number;
  reservedQty: string | number;
  updatedAt: Date;
  skuCode?: string;
  skuDescription?: string;
  pickingStrategy?: string;
  skuExpiryDate?: Date | null;
  unitCode?: string | null;
  unitName?: string | null;
}) {
  return {
    id: row.id,
    skuId: row.skuId,
    onHandQty: String(row.onHandQty ?? "0"),
    lossQty: String(row.lossQty ?? "0"),
    reservedQty: String(row.reservedQty ?? "0"),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    skuCode: row.skuCode ?? "",
    skuDescription: row.skuDescription ?? "",
    pickingStrategy: row.pickingStrategy ?? "FIFO",
    skuExpiryDate: row.skuExpiryDate instanceof Date ? row.skuExpiryDate.toISOString() : (row.skuExpiryDate ?? null),
    unitCode: row.unitCode ?? null,
    unitName: row.unitName ?? null,
  };
}

export const resolvers = {
  Query: {
    inventoryBalances: async (
      _: unknown,
      args: {
        filter?: InventoryBalanceFilterArgs;
        pageSize?: number;
        pageNumber?: number;
        sortBy?: string;
        sortOrder?: string;
      }
    ) => {
      const filter: InventoryBalancesFilter = {};
      if (args.filter) {
        if (args.filter.skuIds) {
          filter.skuId = args.filter.skuIds;
        } else if (args.filter.skuId) {
          filter.skuId = args.filter.skuId;
        }
        if (args.filter.skuCodes) {
          filter.skuCode = args.filter.skuCodes;
        } else if (args.filter.skuCode) {
          filter.skuCode = args.filter.skuCode;
        }
        if (args.filter.search) {
          filter.search = args.filter.search;
        }
        if (args.filter.recordedDate) {
          filter.recordedDate = new Date(args.filter.recordedDate);
        }
      }

      const result = await inventoryBalancesRepository.getInventoryBalances(
        filter,
        {
          pageSize: args.pageSize,
          pageNumber: args.pageNumber,
          sortBy: args.sortBy,
          sortOrder: args.sortOrder,
        }
      );

      return {
        query: result.query.map(transformInventoryBalance),
        pagination: result.pagination,
      };
    },

    inventoryBalancesBySkuIds: async (
      _: unknown,
      args: { skuIds: string[] }
    ) => {
      const balances =
        await inventoryBalancesRepository.getInventoryBalanceBySkuIds(
          args.skuIds
        );
      if (!balances || balances.length === 0) return [];
      return balances.map(transformInventoryBalance);
    },
  },
};
