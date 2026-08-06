/**
 * Load Batches GraphQL Resolvers
 */

import { loadBatchesRepository } from "@/composition-root";
import { getWarehouseCoords } from "./geocode.service";
import { assignDriverWithCapacitySplit } from "./driver-assignment.service";
import { GraphQLError } from "graphql";
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
    outletCode: s.outletCode,
    outletAddress: s.outletAddress,
    outletPhone: null,
    stagingBin: s.stagingBin,
    loadOrder: s.loadOrder,
    loadedAt: s.loadedAt ? s.loadedAt.toISOString() : null,
    lat: s.lat,
    lng: s.lng,
    priority: null,
    zone: s.stagingBin,
    podUrl: s.podUrl,
  };
}

function transformBatch(b: LoadBatchWithDetails) {
  return {
    id: b.id,
    date: b.date,
    regionId: b.regionId,
    regionName: b.region?.regionName ?? null,
    regionCode: b.region?.regionCode ?? null,
    zone: b.region?.regionCode ?? null,
    legDurationsSeconds: null,
    status: b.status,
    assignedAt: b.assignedAt ? b.assignedAt.toISOString() : null,
    createdAt: b.createdAt.toISOString(),
    driver: b.driver ? transformDriver(b.driver) : null,
    stops: b.stops.map(transformStop),
  };
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
