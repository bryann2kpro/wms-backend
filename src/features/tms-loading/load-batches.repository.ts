/**
 * Load Batches Repository
 *
 * A batch groups DOs sharing a staging bin (set during Packing) onto one
 * driver/vehicle. Batches are auto-created/reused per zone+date the moment
 * a staging bin is assigned (see outbound.resolvers.ts setDeliveryOrderStagingBin) —
 * there's no separate manual "confirm staged" step like TMS has.
 */

import { db } from "@/db";
import { LoadBatchesTable, LoadBatchType, LoadBatchInsertType } from "./load-batches.model";
import { DeliveryOrdersTable } from "@/features/outbound/delivery-orders.model";
import { PurchaseOrdersTable } from "@/features/outbound/purchase-orders.model";
import { OutletsTable } from "@/features/master-data/outlets.model";
import { DriversTable, DriverType } from "@/features/tms-driver/drivers.model";
import { and, eq, inArray, sql } from "drizzle-orm";
import { logger } from "@/util/logger";
import { DbTransaction } from "@/types/db-transaction";

export type LoadBatchStop = {
  doId: string;
  doNo: string;
  outletId: string | null;
  outletName: string | null;
  outletAddress: string | null;
  loadOrder: number | null;
  loadedAt: Date | null;
};

export type LoadBatchWithDetails = LoadBatchType & {
  driver: DriverType | null;
  stops: LoadBatchStop[];
};

export class LoadBatchesRepositoryClass {
  constructor() {}

  /** Finds an existing PENDING_DRIVER/LOADING batch for this zone+date, or creates one. */
  async findOrCreateBatchForZone(zone: string, date: string, tx?: DbTransaction): Promise<LoadBatchType> {
    const dbClient = tx ?? db;
    const [existing] = await dbClient
      .select()
      .from(LoadBatchesTable)
      .where(
        and(
          eq(LoadBatchesTable.zone, zone),
          eq(LoadBatchesTable.date, date),
          inArray(LoadBatchesTable.status, ["PENDING_DRIVER", "LOADING"])
        )
      )
      .limit(1);
    if (existing) return existing;

    const [created] = await dbClient
      .insert(LoadBatchesTable)
      .values({ zone, date, status: "PENDING_DRIVER" })
      .returning();
    logger.info("✅ [LoadBatchesRepository.findOrCreateBatchForZone] Created batch:", created.id);
    return created;
  }

  /** Next unused bin in A1..A10, B1..B10, ... J10 order, among currently-active DOs. */
  async getNextAvailableBin(tx?: DbTransaction): Promise<string> {
    const dbClient = tx ?? db;
    const rows = await dbClient
      .select({ stagingBin: DeliveryOrdersTable.stagingBin })
      .from(DeliveryOrdersTable)
      .where(
        and(
          sql`${DeliveryOrdersTable.stagingBin} is not null`,
          sql`${DeliveryOrdersTable.status} not in ('SHIPPED', 'DELIVERED', 'DELIVERED_CONFIRMED', 'CANCELLED')`
        )
      );
    const used = new Set(rows.map((r) => r.stagingBin).filter((b): b is string => !!b));

    const cols = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
    for (const col of cols) {
      for (let row = 1; row <= 10; row++) {
        const bin = `${col}${row}`;
        if (!used.has(bin)) return bin;
      }
    }
    // Grid exhausted (100 concurrent active DOs) — fall back to a numbered overflow bin.
    return `OVERFLOW-${used.size + 1}`;
  }

  /** Assigns a bin to a DO and links it to that zone's batch for today — the single entry point used both by manual assignment and DO-creation auto-assignment. */
  async assignStagingBin(doId: string, bin: string, updatedBy: string, tx?: DbTransaction): Promise<void> {
    const dbClient = tx ?? db;
    const today = new Date().toISOString().slice(0, 10);
    const batch = await this.findOrCreateBatchForZone(bin, today, tx);
    await dbClient
      .update(DeliveryOrdersTable)
      .set({ stagingBin: bin, loadBatchId: batch.id, updatedBy })
      .where(eq(DeliveryOrdersTable.id, doId));
  }

  /** Detaches a DO from its batch — used when a staging bin is cleared, only while still PENDING_DRIVER. */
  async detachDoFromPendingBatch(doId: string, tx?: DbTransaction): Promise<void> {
    const dbClient = tx ?? db;
    const [doRow] = await dbClient.select().from(DeliveryOrdersTable).where(eq(DeliveryOrdersTable.id, doId)).limit(1);
    if (!doRow?.loadBatchId) return;
    const [batch] = await dbClient.select().from(LoadBatchesTable).where(eq(LoadBatchesTable.id, doRow.loadBatchId)).limit(1);
    if (batch?.status !== "PENDING_DRIVER") return;
    await dbClient.update(DeliveryOrdersTable).set({ loadBatchId: null, loadOrder: null }).where(eq(DeliveryOrdersTable.id, doId));
  }

  async getLoadBatches(date?: string): Promise<LoadBatchWithDetails[]> {
    try {
      const whereConditions = date ? [eq(LoadBatchesTable.date, date)] : [];
      const batches = await db
        .select()
        .from(LoadBatchesTable)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
        .orderBy(LoadBatchesTable.createdAt);

      if (batches.length === 0) return [];

      const driverIds = batches.map((b) => b.driverId).filter((id): id is string => !!id);
      const driversMap = new Map<string, DriverType>();
      if (driverIds.length > 0) {
        const drivers = await db.select().from(DriversTable).where(inArray(DriversTable.id, driverIds));
        for (const d of drivers) driversMap.set(d.id, d);
      }

      const batchIds = batches.map((b) => b.id);
      const stopRows = await db
        .select({
          loadBatchId: DeliveryOrdersTable.loadBatchId,
          doId: DeliveryOrdersTable.id,
          doNo: DeliveryOrdersTable.doNo,
          outletId: OutletsTable.outletId,
          outletName: OutletsTable.outletName,
          outletAddress: OutletsTable.address,
          loadOrder: DeliveryOrdersTable.loadOrder,
          loadedAt: DeliveryOrdersTable.loadedAt,
        })
        .from(DeliveryOrdersTable)
        .leftJoin(PurchaseOrdersTable, eq(DeliveryOrdersTable.purchaseOrderId, PurchaseOrdersTable.id))
        .leftJoin(OutletsTable, eq(PurchaseOrdersTable.outletId, OutletsTable.outletId))
        .where(inArray(DeliveryOrdersTable.loadBatchId, batchIds));

      const stopsByBatch = new Map<string, LoadBatchStop[]>();
      for (const row of stopRows) {
        if (!row.loadBatchId) continue;
        const list = stopsByBatch.get(row.loadBatchId) ?? [];
        list.push({
          doId: row.doId,
          doNo: row.doNo,
          outletId: row.outletId,
          outletName: row.outletName,
          outletAddress: row.outletAddress,
          loadOrder: row.loadOrder,
          loadedAt: row.loadedAt,
        });
        stopsByBatch.set(row.loadBatchId, list);
      }

      return batches.map((b) => ({
        ...b,
        driver: b.driverId ? (driversMap.get(b.driverId) ?? null) : null,
        stops: (stopsByBatch.get(b.id) ?? []).sort((a, c) => (a.loadOrder ?? 9999) - (c.loadOrder ?? 9999)),
      }));
    } catch (error) {
      logger.error("❌ [LoadBatchesRepository.getLoadBatches] Error:", error);
      throw error;
    }
  }

  async getBatchById(id: string): Promise<LoadBatchType | null> {
    const [row] = await db.select().from(LoadBatchesTable).where(eq(LoadBatchesTable.id, id)).limit(1);
    return row ?? null;
  }

  async assignDriver(batchId: string, driverId: string): Promise<void> {
    await db
      .update(LoadBatchesTable)
      .set({ driverId, assignedAt: new Date(), status: "LOADING" })
      .where(eq(LoadBatchesTable.id, batchId));
  }

  async unassignDriver(batchId: string): Promise<void> {
    await db
      .update(LoadBatchesTable)
      .set({ driverId: null, assignedAt: null, status: "PENDING_DRIVER" })
      .where(eq(LoadBatchesTable.id, batchId));
  }

  async setBatchStatus(batchId: string, status: string): Promise<void> {
    await db.update(LoadBatchesTable).set({ status }).where(eq(LoadBatchesTable.id, batchId));
  }

  async setLoadOrder(doId: string, loadOrder: number): Promise<void> {
    await db.update(DeliveryOrdersTable).set({ loadOrder }).where(eq(DeliveryOrdersTable.id, doId));
  }

  async markDoLoaded(doId: string, loaded: boolean): Promise<void> {
    await db
      .update(DeliveryOrdersTable)
      .set({ loadedAt: loaded ? new Date() : null })
      .where(eq(DeliveryOrdersTable.id, doId));
  }

  /** Clocked-in, active drivers not already assigned to another LOADING batch today (currentDriverId stays eligible for its own batch). */
  async getAvailableDrivers(currentDriverId?: string | null): Promise<DriverType[]> {
    const assignedRows = await db
      .select({ driverId: LoadBatchesTable.driverId })
      .from(LoadBatchesTable)
      .where(and(eq(LoadBatchesTable.status, "LOADING"), sql`${LoadBatchesTable.driverId} is not null`));
    const assignedIds = new Set(
      assignedRows.map((r) => r.driverId).filter((id): id is string => !!id && id !== currentDriverId)
    );

    const drivers = await db
      .select()
      .from(DriversTable)
      .where(and(eq(DriversTable.status, "ACTIVE"), sql`${DriversTable.clockedInAt} is not null`));

    return drivers.filter((d) => !assignedIds.has(d.id));
  }
}
