/**
 * Load Batches Repository
 *
 * A batch groups DOs sharing an outlet region onto one driver/vehicle —
 * matching TMS's own Loading page (one batch per region per day). Batches
 * are auto-created/reused the moment a DO is created (see
 * outbound.services.ts createPurchaseOrder). Each DO's staging bin (from
 * Packing) travels along as a per-row attribute, independent of batching.
 */

import { db } from "@/db";
import { LoadBatchesTable, LoadBatchType, LoadBatchInsertType } from "./load-batches.model";
import { DeliveryOrdersTable } from "@/features/outbound/delivery-orders.model";
import { PurchaseOrdersTable } from "@/features/outbound/purchase-orders.model";
import { OutletsTable } from "@/features/master-data/outlets.model";
import { RegionTable, RegionType } from "@/features/master-data/region.model";
import { DriversTable, DriverType } from "@/features/tms-driver/drivers.model";
import { GeocodeTable } from "./geocode.model";
import { PodRecordsTable } from "@/features/tms-driver/pod.model";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { logger } from "@/util/logger";
import { DbTransaction } from "@/types/db-transaction";

export type LoadBatchStop = {
  doId: string;
  doNo: string;
  outletId: string | null;
  outletName: string | null;
  outletCode: string | null;
  outletAddress: string | null;
  stagingBin: string | null;
  loadOrder: number | null;
  loadedAt: Date | null;
  lat: number | null;
  lng: number | null;
  podUrl: string | null;
};

export type LoadBatchWithDetails = LoadBatchType & {
  region: RegionType | null;
  driver: DriverType | null;
  stops: LoadBatchStop[];
};

export class LoadBatchesRepositoryClass {
  constructor() {}

  /** Finds an existing PENDING_DRIVER/LOADING batch for this region+date, or creates one. */
  async findOrCreateBatchForRegion(regionId: string, date: string, tx?: DbTransaction): Promise<LoadBatchType> {
    const dbClient = tx ?? db;
    const [existing] = await dbClient
      .select()
      .from(LoadBatchesTable)
      .where(
        and(
          eq(LoadBatchesTable.regionId, regionId),
          eq(LoadBatchesTable.date, date),
          inArray(LoadBatchesTable.status, ["PENDING_DRIVER", "LOADING"])
        )
      )
      .limit(1);
    if (existing) return existing;

    const [created] = await dbClient
      .insert(LoadBatchesTable)
      .values({ regionId, date, status: "PENDING_DRIVER" })
      .returning();
    logger.info("✅ [LoadBatchesRepository.findOrCreateBatchForRegion] Created batch:", created.id);
    return created;
  }

  /** Adds a DO to today's batch for its outlet's region — called once at DO creation. Returns the batch so the caller can (re)compute its route once the transaction commits. */
  async assignDoToRegionalBatch(doId: string, regionId: string, tx?: DbTransaction): Promise<LoadBatchType> {
    const dbClient = tx ?? db;
    const today = new Date().toISOString().slice(0, 10);
    const batch = await this.findOrCreateBatchForRegion(regionId, today, tx);
    await dbClient.update(DeliveryOrdersTable).set({ loadBatchId: batch.id }).where(eq(DeliveryOrdersTable.id, doId));
    return batch;
  }

  /**
   * Next unused bin in B1..B14, C1..C14, ... M14 order, among currently-active DOs.
   * Matches the real warehouse map's staging area: columns B-M (12 cols, A/N are
   * real storage racks not staging), rows 1-14, single layer (no level suffix).
   */
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

    const cols = ["B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"];
    for (const col of cols) {
      for (let row = 1; row <= 14; row++) {
        const bin = `${col}${row}`;
        if (!used.has(bin)) return bin;
      }
    }
    // Grid exhausted (168 concurrent active DOs) — fall back to a numbered overflow bin.
    return `OVERFLOW-${used.size + 1}`;
  }

  /** Sets a DO's staging bin — independent of batch membership, which is region-based and set at DO creation. */
  async setStagingBin(doId: string, bin: string | null, updatedBy: string, tx?: DbTransaction): Promise<void> {
    const dbClient = tx ?? db;
    await dbClient.update(DeliveryOrdersTable).set({ stagingBin: bin, updatedBy }).where(eq(DeliveryOrdersTable.id, doId));
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

      const regionIds = [...new Set(batches.map((b) => b.regionId))];
      const regionsMap = new Map<string, RegionType>();
      if (regionIds.length > 0) {
        const regions = await db.select().from(RegionTable).where(inArray(RegionTable.regionId, regionIds));
        for (const r of regions) regionsMap.set(r.regionId, r);
      }

      const batchIds = batches.map((b) => b.id);
      const stopRows = await db
        .select({
          loadBatchId: DeliveryOrdersTable.loadBatchId,
          doId: DeliveryOrdersTable.id,
          doNo: DeliveryOrdersTable.doNo,
          outletId: OutletsTable.outletId,
          outletName: OutletsTable.outletName,
          outletCode: OutletsTable.outletCode,
          outletAddress: OutletsTable.address,
          stagingBin: DeliveryOrdersTable.stagingBin,
          loadOrder: DeliveryOrdersTable.loadOrder,
          loadedAt: DeliveryOrdersTable.loadedAt,
        })
        .from(DeliveryOrdersTable)
        .leftJoin(PurchaseOrdersTable, eq(DeliveryOrdersTable.purchaseOrderId, PurchaseOrdersTable.id))
        .leftJoin(OutletsTable, eq(PurchaseOrdersTable.outletId, OutletsTable.outletId))
        .where(inArray(DeliveryOrdersTable.loadBatchId, batchIds));

      const outletIds = [...new Set(stopRows.map((r) => r.outletId).filter((id): id is string => !!id))];
      const geocodeMap = new Map<string, { lat: number; lng: number }>();
      if (outletIds.length > 0) {
        const geoRows = await db
          .select({ entityId: GeocodeTable.entityId, lat: GeocodeTable.lat, lng: GeocodeTable.lng })
          .from(GeocodeTable)
          .where(and(eq(GeocodeTable.entityType, "outlet"), inArray(GeocodeTable.entityId, outletIds)));
        for (const g of geoRows) {
          if (g.lat != null && g.lng != null) geocodeMap.set(g.entityId, { lat: Number(g.lat), lng: Number(g.lng) });
        }
      }

      const doIds = stopRows.map((r) => r.doId);
      const podUrlMap = new Map<string, string>();
      if (doIds.length > 0) {
        const podRows = await db
          .select({ doId: PodRecordsTable.doId, photoUrl: PodRecordsTable.photoUrl })
          .from(PodRecordsTable)
          .where(inArray(PodRecordsTable.doId, doIds))
          .orderBy(desc(PodRecordsTable.capturedAt));
        // First row per doId wins — rows arrive newest-first, so this keeps the latest POD.
        for (const p of podRows) {
          if (!podUrlMap.has(p.doId)) podUrlMap.set(p.doId, p.photoUrl);
        }
      }

      const stopsByBatch = new Map<string, LoadBatchStop[]>();
      for (const row of stopRows) {
        if (!row.loadBatchId) continue;
        const coords = row.outletId ? geocodeMap.get(row.outletId) : undefined;
        const list = stopsByBatch.get(row.loadBatchId) ?? [];
        list.push({
          doId: row.doId,
          doNo: row.doNo,
          outletId: row.outletId,
          outletName: row.outletName,
          outletCode: row.outletCode,
          outletAddress: row.outletAddress,
          stagingBin: row.stagingBin,
          loadOrder: row.loadOrder,
          loadedAt: row.loadedAt,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          podUrl: podUrlMap.get(row.doId) ?? null,
        });
        stopsByBatch.set(row.loadBatchId, list);
      }

      return batches.map((b) => ({
        ...b,
        region: regionsMap.get(b.regionId) ?? null,
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

  /** Always creates a fresh batch (unlike findOrCreateBatchForRegion) — used to split overflow stops off an existing batch. */
  async createBatchForRegion(regionId: string, date: string): Promise<LoadBatchType> {
    const [created] = await db.insert(LoadBatchesTable).values({ regionId, date, status: "PENDING_DRIVER" }).returning();
    logger.info("✅ [LoadBatchesRepository.createBatchForRegion] Created overflow batch:", created.id);
    return created;
  }

  /** Moves DOs to a different batch, resetting their load order so it can be recomputed there. */
  async moveDosToBatch(doIds: string[], batchId: string): Promise<void> {
    if (doIds.length === 0) return;
    await db
      .update(DeliveryOrdersTable)
      .set({ loadBatchId: batchId, loadOrder: null })
      .where(inArray(DeliveryOrdersTable.id, doIds));
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
