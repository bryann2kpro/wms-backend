/**
 * Load Batches GraphQL Resolvers
 */

import { loadBatchesRepository } from "@/composition-root";
import { geocodeEntity, getGeocodeMap, getWarehouseCoords } from "./geocode.service";
import { optimizeRoute, type RouteStop } from "./route-optimizer.util";
import { GraphQLError } from "graphql";
import { logger } from "@/util/logger";
import type { DriverType } from "@/features/tms-driver/drivers.model";
import type { LoadBatchWithDetails, LoadBatchStop } from "./load-batches.repository";

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

/** Geocodes any un-cached outlets in the batch, then persists a nearest-neighbour + 3-opt load order. */
async function computeRouteForBatch(batchId: string): Promise<void> {
  const batches = await loadBatchesRepository.getLoadBatches();
  const batch = batches.find((b) => b.id === batchId);
  if (!batch || batch.stops.length === 0) return;

  const warehouseCoords = await getWarehouseCoords();
  if (!warehouseCoords) {
    logger.warn("[load-batches] No warehouse coords available — skipping route ordering");
    return;
  }

  const outletIds = batch.stops.map((s) => s.outletId).filter((id): id is string => !!id);
  const coordsMap = await getGeocodeMap(outletIds);

  for (const stop of batch.stops) {
    if (!stop.outletId || coordsMap.has(stop.outletId)) continue;
    if (!stop.outletAddress) continue;
    const coords = await geocodeEntity("outlet", stop.outletId, stop.outletAddress);
    if (coords) coordsMap.set(stop.outletId, coords);
  }

  const routeStops: RouteStop[] = batch.stops
    .filter((s) => s.outletId && coordsMap.has(s.outletId))
    .map((s) => ({ doId: s.doId, ...coordsMap.get(s.outletId as string)! }));

  if (routeStops.length === 0) return;

  const orderedDoIds = optimizeRoute(routeStops, warehouseCoords);
  for (let i = 0; i < orderedDoIds.length; i++) {
    await loadBatchesRepository.setLoadOrder(orderedDoIds[i], i + 1);
  }
}

export const resolvers = {
  Query: {
    loadBatches: async (_: unknown, { date }: { date?: string }) => {
      const batches = await loadBatchesRepository.getLoadBatches(date);
      return batches.map(transformBatch);
    },
  },

  Mutation: {
    assignBatchDriver: async (_: unknown, { batchId, driverId }: { batchId: string; driverId: string }) => {
      await loadBatchesRepository.assignDriver(batchId, driverId);
      await computeRouteForBatch(batchId);
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
      await loadBatchesRepository.assignDriver(batchId, available[0].id);
      await computeRouteForBatch(batchId);
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
