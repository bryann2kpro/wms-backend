/**
 * Reservation repository
 *
 * @description Data access for `stock_reservations` and `customer_priority`.
 * Mutations accept an optional `DbTransaction` so balance updates run atomically
 * with the reservation row change.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import type { DbTransaction } from "@/types/db-transaction";
import { InventoryBalancesTable } from "@/features/inventory/inventory-balance/inventory.model";
import {
  StockReservationsTable,
  type StockReservationInsertType,
  type StockReservationType,
} from "./reservation.model";

export type ReservationStatus =
  | "ACTIVE"
  | "CONSUMED"
  | "EXPIRED"
  | "CANCELLED"
  | "RELEASED";

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
}
