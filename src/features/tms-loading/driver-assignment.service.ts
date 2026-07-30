/**
 * Driver Assignment Service
 *
 * Shared by both admin-triggered assignment (load-batches resolvers) and
 * automatic assignment on driver clock-in (drivers resolver) — kept in one
 * place so the capacity-split behaviour is identical either way.
 */

import { loadBatchesRepository, driversRepository } from "@/composition-root";
import { computeRouteForBatch } from "./route-compute.service";
import { GraphQLError } from "graphql";
import { logger } from "@/util/logger";
import type { DriverType } from "@/features/tms-driver/drivers.model";

/** Falls back to 10 pallets when a driver has no configured capacity, matching TMS's default-vehicle behaviour. */
const DEFAULT_CAPACITY = 10;
export function getDriverCapacity(d: DriverType): number {
  const parsed = d.pallet4x3 != null ? Number(d.pallet4x3) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CAPACITY;
}

/**
 * Assigns a driver to a batch, splitting off overflow stops into a new
 * PENDING_DRIVER batch (same region/date) when the stop count exceeds the
 * driver's pallet capacity — matching TMS's autoAssignDriverForBatch.
 * Route order is computed first so the split keeps the nearest [capacity]
 * stops with the driver and pushes the tail of the route to the overflow batch.
 */
export async function assignDriverWithCapacitySplit(batchId: string, driverId: string): Promise<void> {
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
      `ℹ️ [driver-assignment] Split batch ${batchId}: ${overflowDoIds.length} overflow stop(s) moved to new batch ${overflowBatch.id}`
    );
  }

  await loadBatchesRepository.assignDriver(batchId, driverId);
  await computeRouteForBatch(batchId);
}

/**
 * Called right after a driver clocks in. Finds the oldest PENDING_DRIVER
 * batch (any region) and assigns this driver to it. If there's no pending
 * batch, does nothing — the driver just stays available for the next one
 * (or a manual assign) rather than forcing an assignment.
 */
export async function autoAssignPendingBatchToDriver(driverId: string): Promise<void> {
  const batches = await loadBatchesRepository.getLoadBatches();
  const pending = batches.find((b) => b.status === "PENDING_DRIVER" && b.stops.length > 0);
  if (!pending) {
    logger.info(`ℹ️ [driver-assignment] Driver ${driverId} clocked in — no pending batch to assign right now`);
    return;
  }

  await assignDriverWithCapacitySplit(pending.id, driverId);
  logger.info(`✅ [driver-assignment] Auto-assigned driver ${driverId} to batch ${pending.id} on clock-in`);
}
