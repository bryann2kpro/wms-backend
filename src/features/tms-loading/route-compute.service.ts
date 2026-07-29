/**
 * Route Compute Service
 *
 * Geocodes any un-cached outlets in a batch, then persists a
 * nearest-neighbour + 3-opt load order. Called both right after a batch is
 * created (so pending, unassigned batches already show a route on the map —
 * matches TMS's own behaviour of computing the route at batch-creation time,
 * not driver-assignment time) and again after a driver is assigned.
 */

import { loadBatchesRepository } from "@/composition-root";
import { geocodeEntity, getGeocodeMap, getWarehouseCoords } from "./geocode.service";
import { optimizeRoute, type RouteStop } from "./route-optimizer.util";
import { logger } from "@/util/logger";

export async function computeRouteForBatch(batchId: string): Promise<void> {
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
