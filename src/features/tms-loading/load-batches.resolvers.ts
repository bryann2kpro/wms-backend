/**
 * Load Batches GraphQL Resolvers
 */

import { loadBatchesRepository, driversRepository } from "@/composition-root";
import { getWarehouseCoords } from "./geocode.service";
import { computeRouteForBatch } from "./route-compute.service";
import { GraphQLError } from "graphql";
import { logger } from "@/util/logger";
import type { DriverType } from "@/features/tms-driver/drivers.model";
import type { LoadBatchWithDetails, LoadBatchStop } from "./load-batches.repository";

/** Falls back to 10 pallets when a driver has no configured capacity, matching TMS's default-vehicle behaviour. */
const DEFAULT_CAPACITY = 10;
function getDriverCapacity(d: DriverType): number {
  const parsed = d.pallet4x3 != null ? Number(d.pallet4x3) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CAPACITY;
}

function transformDriver(d: DriverType) {
  return {
    id: d.id,
    name: d.name,
    phone: d.phone,
    licenseNumber: d.licenseNumber,
    licenseExpiry: d.licenseExpiry,
    status: d.status,
    plateNumber: d.plateNumber ?? null,
    vehicleType: d.vehicleType ?? null,
    fleetCategory: d.fleetCategory ?? null,
    barcode: d.barcode ?? null,
    clockedInAt: d.clockedInAt ? d.clockedInAt.toISOString() : null,
    email: d.email ?? null,
    btm: d.btm ?? null,
    bdm: d.bdm ?? null,
    payload: d.payload ?? null,
    length: d.length ?? null,
    width: d.width ?? null,
    height: d.height ?? null,
    pallet4x3: d.pallet4x3 ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

function transformStop(s: LoadBatchStop) {
  return {
    doId: s.doId,
    doNo: s.doNo,
    outletId: s.outletId,
    outletName: s.outletName,
    outletAddress: s.outletAddress,
    stagingBin: s.stagingBin,
    loadOrder: s.loadOrder,
    loadedAt: s.loadedAt ? s.loadedAt.toISOString() : null,
    lat: s.lat,
    lng: s.lng,
  };
}

function transformBatch(b: LoadBatchWithDetails) {
  return {
    id: b.id,
    date: b.date,
    regionId: b.regionId,
    regionName: b.region?.regionName ?? null,
    regionCode: b.region?.regionCode ?? null,
    status: b.status,
    assignedAt: b.assignedAt ? b.assignedAt.toISOString() : null,
    createdAt: b.createdAt.toISOString(),
    driver: b.driver ? transformDriver(b.driver) : null,
    stops: b.stops.map(transformStop),
  };
}

/**
 * Assigns a driver to a batch, splitting off overflow stops into a new
 * PENDING_DRIVER batch (same region/date) when the stop count exceeds the
 * driver's pallet capacity — matching TMS's autoAssignDriverForBatch.
 * Route order is computed first so the split keeps the nearest [capacity]
 * stops with the driver and pushes the tail of the route to the overflow batch.
 */
async function assignDriverWithCapacitySplit(batchId: string, driverId: string): Promise<void> {
  const driver = await driversRepository.getDriverById(driverId);
  if (!driver) throw new GraphQLError("Driver not found", { extensions: { code: "NOT_FOUND" } });

  await computeRouteForBatch(batchId);
  const batches = await loadBatchesRepository.getLoadBatches();
  const batch = batches.find((b) => b.id === batchId);
  if (!batch) throw new GraphQLError("Load batch not found", { extensions: { code: "NOT_FOUND" } });

  const capacity = getDriverCapacity(driver);
  if (batch.stops.length > capacity) {
    const sorted = [...batch.stops].sort((a, c) => (a.loadOrder ?? 9999) - (c.loadOrder ?? 9999));
    const overflowDoIds = sorted.slice(capacity).map((s) => s.doId);

    const overflowBatch = await loadBatchesRepository.createBatchForRegion(batch.regionId, batch.date);
    await loadBatchesRepository.moveDosToBatch(overflowDoIds, overflowBatch.id);
    await computeRouteForBatch(overflowBatch.id);
    logger.info(
      `ℹ️ [load-batches] Split batch ${batchId}: ${overflowDoIds.length} overflow stop(s) moved to new batch ${overflowBatch.id}`
    );
  }

  await loadBatchesRepository.assignDriver(batchId, driverId);
  await computeRouteForBatch(batchId);
}

export const resolvers = {
  Query: {
    loadBatches: async (_: unknown, { date }: { date?: string }) => {
      const batches = await loadBatchesRepository.getLoadBatches(date);
      return batches.map(transformBatch);
    },

    warehouseCoords: async () => {
      return getWarehouseCoords();
    },
  },

  Mutation: {
    assignBatchDriver: async (_: unknown, { batchId, driverId }: { batchId: string; driverId: string }) => {
      await assignDriverWithCapacitySplit(batchId, driverId);
      const batches = await loadBatchesRepository.getLoadBatches();
      const batch = batches.find((b) => b.id === batchId);
      if (!batch) throw new GraphQLError("Load batch not found", { extensions: { code: "NOT_FOUND" } });
      return transformBatch(batch);
    },

    autoAssignBatchDriver: async (_: unknown, { batchId }: { batchId: string }) => {
      const batch = await loadBatchesRepository.getBatchById(batchId);
      if (!batch) throw new GraphQLError("Load batch not found", { extensions: { code: "NOT_FOUND" } });
      const available = await loadBatchesRepository.getAvailableDrivers(batch.driverId);
      if (available.length === 0) return null;
      await assignDriverWithCapacitySplit(batchId, available[0].id);
      const batches = await loadBatchesRepository.getLoadBatches();
      const updated = batches.find((b) => b.id === batchId);
      return updated ? transformBatch(updated) : null;
    },

    unassignBatchDriver: async (_: unknown, { batchId }: { batchId: string }) => {
      await loadBatchesRepository.unassignDriver(batchId);
      const batches = await loadBatchesRepository.getLoadBatches();
      const batch = batches.find((b) => b.id === batchId);
      if (!batch) throw new GraphQLError("Load batch not found", { extensions: { code: "NOT_FOUND" } });
      return transformBatch(batch);
    },

    markBatchItemLoaded: async (_: unknown, { doId, loaded }: { doId: string; loaded: boolean }) => {
      await loadBatchesRepository.markDoLoaded(doId, loaded);
      return true;
    },

    confirmBatchLoading: async (_: unknown, { loadedDoIds }: { batchId: string; loadedDoIds: string[] }) => {
      for (const doId of loadedDoIds) {
        await loadBatchesRepository.markDoLoaded(doId, true);
      }
      return true;
    },

    completeBatch: async (_: unknown, { batchId }: { batchId: string }) => {
      await loadBatchesRepository.setBatchStatus(batchId, "DONE");
      return true;
    },

    undoLoadBatch: async (_: unknown, { batchId }: { batchId: string }) => {
      const batches = await loadBatchesRepository.getLoadBatches();
      const batch = batches.find((b) => b.id === batchId);
      if (batch) {
        for (const stop of batch.stops) {
          await loadBatchesRepository.markDoLoaded(stop.doId, false);
        }
      }
      await loadBatchesRepository.unassignDriver(batchId);
      return true;
    },
  },
};
