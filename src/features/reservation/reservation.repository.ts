/**
 * Reservation repository
 *
 * @description Data access for `stock_reservations` and `customer_priority`.
 * Mutations accept an optional `DbTransaction` so balance updates run atomically
 * with the reservation row change.
 */

import { and, asc, count, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { PgSelectBase } from "drizzle-orm/pg-core";
import { db } from "@/db";
import type { DbTransaction } from "@/types/db-transaction";
import { pagination } from "@/util/pagination";
import type { PaginatedResponse, PaginationParams } from "@/features/rbac/rbac.model";
import { InventoryBalancesTable } from "@/features/inventory/inventory-balance/inventory.model";
import {
  CustomerPriorityTable,
  StockReservationsTable,
  type CustomerPriorityInsertType,
  type CustomerPriorityType,
  type StockReservationFilter,
  type StockReservationInsertType,
  type StockReservationType,
} from "./reservation.model";

type PgQueryType = PgSelectBase<any, any, any, any>;

export type ReservationStatus =
  | "ACTIVE"
  | "CONSUMED"
  | "EXPIRED"
  | "CANCELLED"
  | "RELEASED";

export type UpsertCustomerPriorityInput = {
  customerCode: string;
  customerName?: string | null;
  rank?: number;
  isActive?: boolean;
  notes?: string | null;
};

export class ReservationRepository {
  async getById(
    organizationId: string,
    id: string,
    tx?: DbTransaction,
  ): Promise<StockReservationType | null> {
    const conn = tx ?? db;
    const rows = await conn
      .select()
      .from(StockReservationsTable)
      .where(
        and(
          eq(StockReservationsTable.id, id),
          eq(StockReservationsTable.organizationId, organizationId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async list(
    organizationId: string,
    filter: StockReservationFilter = {},
    paginationParams?: PaginationParams,
    tx?: DbTransaction,
  ): Promise<PaginatedResponse<StockReservationType>> {
    const conn = tx ?? db;
    const conditions = [eq(StockReservationsTable.organizationId, organizationId)];

    if (filter.id) {
      const ids = Array.isArray(filter.id) ? filter.id : [filter.id];
      conditions.push(inArray(StockReservationsTable.id, ids));
    }
    if (filter.reservationNo) {
      conditions.push(eq(StockReservationsTable.reservationNo, filter.reservationNo));
    }
    if (filter.customerCode) {
      const codes = Array.isArray(filter.customerCode)
        ? filter.customerCode
        : [filter.customerCode];
      conditions.push(inArray(StockReservationsTable.customerCode, codes));
    }
    if (filter.skuId) {
      const skuIds = Array.isArray(filter.skuId) ? filter.skuId : [filter.skuId];
      conditions.push(inArray(StockReservationsTable.skuId, skuIds));
    }
    if (filter.grnItemId) {
      const grnItemIds = Array.isArray(filter.grnItemId)
        ? filter.grnItemId
        : [filter.grnItemId];
      conditions.push(inArray(StockReservationsTable.grnItemId, grnItemIds));
    }
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      conditions.push(inArray(StockReservationsTable.status, statuses));
    }

    const whereClause = and(...conditions);
    const baseQuery = conn
      .select()
      .from(StockReservationsTable)
      .where(whereClause)
      .orderBy(desc(StockReservationsTable.createdAt));

    if (!paginationParams?.pageSize && !paginationParams?.pageNumber) {
      const data = await baseQuery;
      const totalCount = data.length;
      return {
        query: data,
        pagination: {
          count: totalCount,
          totalCount,
          currentPage: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      };
    }

    const pageSize = paginationParams.pageSize || 10;
    const pageNumber = paginationParams.pageNumber || 1;
    const countRows = await conn
      .select({ total: count() })
      .from(StockReservationsTable)
      .where(whereClause);
    const totalCount = Number(countRows[0]?.total ?? 0);
    const paginatedQuery = pagination(
      baseQuery as unknown as PgQueryType,
      pageSize,
      pageNumber,
      totalCount,
    );
    const data = (await paginatedQuery.query) as StockReservationType[];

    return { query: data, pagination: paginatedQuery.pagination };
  }

  async insert(
    input: StockReservationInsertType,
    tx: DbTransaction,
  ): Promise<StockReservationType> {
    const [row] = await tx
      .insert(StockReservationsTable)
      .values(input)
      .returning();
    return row;
  }

  async update(
    organizationId: string,
    id: string,
    patch: Partial<
      Pick<
        StockReservationType,
        | "qtyReserved"
        | "qtyConsumed"
        | "reserveStart"
        | "reserveEnd"
        | "priorityFlag"
        | "status"
        | "customerCode"
        | "grnItemId"
        | "notes"
        | "updatedBy"
      >
    >,
    tx: DbTransaction,
  ): Promise<StockReservationType | null> {
    const [row] = await tx
      .update(StockReservationsTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(StockReservationsTable.id, id),
          eq(StockReservationsTable.organizationId, organizationId),
        ),
      )
      .returning();
    return row ?? null;
  }

  async listActiveBySku(
    organizationId: string,
    skuId: string,
    tx?: DbTransaction,
  ): Promise<StockReservationType[]> {
    const conn = tx ?? db;
    return conn
      .select()
      .from(StockReservationsTable)
      .where(
        and(
          eq(StockReservationsTable.organizationId, organizationId),
          eq(StockReservationsTable.skuId, skuId),
          inArray(StockReservationsTable.status, ["ACTIVE"]),
        ),
      );
  }

  async listExpiredActive(
    before: Date,
    organizationId?: string,
    tx?: DbTransaction,
  ): Promise<StockReservationType[]> {
    const conn = tx ?? db;
    const conditions = [
      eq(StockReservationsTable.status, "ACTIVE"),
      lt(StockReservationsTable.reserveEnd, before),
    ];
    if (organizationId) {
      conditions.push(eq(StockReservationsTable.organizationId, organizationId));
    }
    return conn
      .select()
      .from(StockReservationsTable)
      .where(and(...conditions))
      .orderBy(asc(StockReservationsTable.reserveEnd));
  }

  /**
   * Atomically bump `inventory_balances.reserved_qty` by `delta`
   * (positive to reserve more, negative to release). Returns the new value
   * so callers can assert non-negative.
   */
  async adjustInventoryReservedQty(
    organizationId: string,
    inventoryBalanceId: string,
    delta: string,
    tx: DbTransaction,
  ): Promise<{ reservedQty: string; onHandQty: string } | null> {
    const [row] = await tx
      .update(InventoryBalancesTable)
      .set({
        reservedQty: sql`${InventoryBalancesTable.reservedQty} + ${delta}::numeric`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(InventoryBalancesTable.id, inventoryBalanceId),
          eq(InventoryBalancesTable.organizationId, organizationId),
        ),
      )
      .returning({
        reservedQty: InventoryBalancesTable.reservedQty,
        onHandQty: InventoryBalancesTable.onHandQty,
      });
    return row ?? null;
  }

  async getInventoryBalanceBySku(
    organizationId: string,
    skuId: string,
    tx: DbTransaction,
  ): Promise<{ id: string; onHandQty: string; reservedQty: string } | null> {
    const [row] = await tx
      .select({
        id: InventoryBalancesTable.id,
        onHandQty: InventoryBalancesTable.onHandQty,
        reservedQty: InventoryBalancesTable.reservedQty,
      })
      .from(InventoryBalancesTable)
      .where(
        and(
          eq(InventoryBalancesTable.organizationId, organizationId),
          eq(InventoryBalancesTable.skuId, skuId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * Row-level lock on the inventory balance for concurrent reservation safety.
   */
  async getInventoryBalanceBySkuForUpdate(
    organizationId: string,
    skuId: string,
    tx: DbTransaction,
  ): Promise<{ id: string; onHandQty: string; reservedQty: string } | null> {
    const result = await tx.execute<{
      id: string;
      onHandQty: string;
      reservedQty: string;
    }>(sql`
      SELECT
        id,
        on_hand_qty::text AS "onHandQty",
        reserved_qty::text AS "reservedQty"
      FROM main.inventory_balances
      WHERE organization_id = ${organizationId}
        AND sku_id = ${skuId}
      FOR UPDATE
      LIMIT 1
    `);
    return result.rows[0] ?? null;
  }

  // ─── Customer priority ───────────────────────────────────────────────────

  async listCustomerPriorities(
    organizationId: string,
    tx?: DbTransaction,
  ): Promise<CustomerPriorityType[]> {
    const conn = tx ?? db;
    return conn
      .select()
      .from(CustomerPriorityTable)
      .where(eq(CustomerPriorityTable.organizationId, organizationId))
      .orderBy(asc(CustomerPriorityTable.rank));
  }

  async getCustomerPriorityByCode(
    organizationId: string,
    customerCode: string,
    tx?: DbTransaction,
  ): Promise<CustomerPriorityType | null> {
    const conn = tx ?? db;
    const [row] = await conn
      .select()
      .from(CustomerPriorityTable)
      .where(
        and(
          eq(CustomerPriorityTable.organizationId, organizationId),
          eq(CustomerPriorityTable.customerCode, customerCode),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async getMaxRank(organizationId: string, tx: DbTransaction): Promise<number> {
    const [row] = await tx
      .select({ maxRank: sql<number>`COALESCE(MAX(${CustomerPriorityTable.rank}), 0)` })
      .from(CustomerPriorityTable)
      .where(eq(CustomerPriorityTable.organizationId, organizationId));
    return Number(row?.maxRank ?? 0);
  }

  async insertCustomerPriority(
    input: CustomerPriorityInsertType,
    tx: DbTransaction,
  ): Promise<CustomerPriorityType> {
    const [row] = await tx.insert(CustomerPriorityTable).values(input).returning();
    return row;
  }

  async updateCustomerPriority(
    organizationId: string,
    customerCode: string,
    patch: Partial<
      Pick<
        CustomerPriorityType,
        "customerName" | "rank" | "isActive" | "notes" | "updatedBy"
      >
    >,
    tx: DbTransaction,
  ): Promise<CustomerPriorityType | null> {
    const [row] = await tx
      .update(CustomerPriorityTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(CustomerPriorityTable.organizationId, organizationId),
          eq(CustomerPriorityTable.customerCode, customerCode),
        ),
      )
      .returning();
    return row ?? null;
  }

  /**
   * Atomically rewrite ranks 1..n without violating (organization_id, rank) uniqueness.
   * Phase 1 negates existing ranks; phase 2 assigns final positions.
   */
  async reorderCustomerPriorities(
    organizationId: string,
    userId: string,
    ranking: Array<{ customerCode: string }>,
    tx: DbTransaction,
  ): Promise<CustomerPriorityType[]> {
    const existing = await this.listCustomerPriorities(organizationId, tx);
    const existingCodes = new Set(existing.map((r) => r.customerCode));
    const rankingCodes = ranking.map((r) => r.customerCode);

    if (rankingCodes.length !== existing.length) {
      throw new Error(
        "reorderCustomerPriorities must include every customer priority row for the organization.",
      );
    }

    const uniqueCodes = new Set(rankingCodes);
    if (uniqueCodes.size !== rankingCodes.length) {
      throw new Error("reorderCustomerPriorities contains duplicate customer codes.");
    }

    for (const code of rankingCodes) {
      if (!existingCodes.has(code)) {
        throw new Error(`Unknown customer code "${code}" in reorder ranking.`);
      }
    }

    await tx
      .update(CustomerPriorityTable)
      .set({
        rank: sql`-1 * ${CustomerPriorityTable.rank}`,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(CustomerPriorityTable.organizationId, organizationId));

    for (let i = 0; i < ranking.length; i++) {
      await tx
        .update(CustomerPriorityTable)
        .set({
          rank: i + 1,
          updatedAt: new Date(),
          updatedBy: userId,
        })
        .where(
          and(
            eq(CustomerPriorityTable.organizationId, organizationId),
            eq(CustomerPriorityTable.customerCode, ranking[i].customerCode),
          ),
        );
    }

    return this.listCustomerPriorities(organizationId, tx);
  }
}
