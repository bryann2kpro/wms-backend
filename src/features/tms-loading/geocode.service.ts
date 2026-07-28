/**
 * Geocode Service
 *
 * Calls Google Maps Geocoding API to convert an address into lat/lng, then
 * caches the result in geocode_cache so we don't hit the API on every
 * request. Ported from TMS's own geocode.service.ts.
 */

import { db } from "@/db";
import { logger } from "@/util/logger";
import { env } from "@/env";
import { GeocodeTable } from "./geocode.model";
import { WarehousesTable } from "@/features/master-data/warehouses.model";
import { and, eq } from "drizzle-orm";

const MAPS_API = "https://maps.googleapis.com/maps/api/geocode/json";

async function callGoogleGeocoding(address: string): Promise<{ lat: number; lng: number } | null> {
  const key = env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    logger.warn("[geocode] GOOGLE_MAPS_API_KEY not set — skipping geocoding");
    return null;
  }

  try {
    const url = `${MAPS_API}?address=${encodeURIComponent(address)}&key=${key}`;
    const res = await fetch(url);
    const json = (await res.json()) as {
      status: string;
      results: Array<{ geometry: { location: { lat: number; lng: number } } }>;
    };

    if (json.status !== "OK" || !json.results[0]) {
      logger.warn(`[geocode] Google Maps returned status "${json.status}" for address: ${address}`);
      return null;
    }

    return json.results[0].geometry.location;
  } catch (err) {
    logger.error("[geocode] Google Maps API error:", err);
    return null;
  }
}

/** Geocode an entity (outlet or warehouse) by address. Returns cached result if already geocoded. */
export async function geocodeEntity(
  entityType: "outlet" | "warehouse",
  entityId: string,
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const [cached] = await db
    .select()
    .from(GeocodeTable)
    .where(and(eq(GeocodeTable.entityType, entityType), eq(GeocodeTable.entityId, entityId)))
    .limit(1);

  if (cached?.lat != null && cached?.lng != null) {
    return { lat: Number(cached.lat), lng: Number(cached.lng) };
  }

  const coords = await callGoogleGeocoding(address);
  if (!coords) return null;

  if (cached) {
    await db
      .update(GeocodeTable)
      .set({ lat: String(coords.lat), lng: String(coords.lng), label: address, updatedAt: new Date() })
      .where(and(eq(GeocodeTable.entityType, entityType), eq(GeocodeTable.entityId, entityId)));
  } else {
    await db.insert(GeocodeTable).values({
      entityType,
      entityId,
      label: address,
      lat: String(coords.lat),
      lng: String(coords.lng),
    });
  }

  logger.info(`[geocode] Geocoded ${entityType} ${entityId}: ${coords.lat}, ${coords.lng}`);
  return coords;
}

/** Get cached lat/lng for a list of outlet IDs. Returns a Map<outletId, {lat, lng}>. */
export async function getGeocodeMap(entityIds: string[]): Promise<Map<string, { lat: number; lng: number }>> {
  if (entityIds.length === 0) return new Map();
  const { inArray } = await import("drizzle-orm");
  const rows = await db
    .select({ entityId: GeocodeTable.entityId, lat: GeocodeTable.lat, lng: GeocodeTable.lng })
    .from(GeocodeTable)
    .where(and(eq(GeocodeTable.entityType, "outlet"), inArray(GeocodeTable.entityId, entityIds)));

  const map = new Map<string, { lat: number; lng: number }>();
  for (const row of rows) {
    if (row.lat != null && row.lng != null) {
      map.set(row.entityId, { lat: Number(row.lat), lng: Number(row.lng) });
    }
  }
  return map;
}

/**
 * Warehouse depot coords — geocodes the first warehouse in master data on
 * first use (WMS has no dedicated "the warehouse" singleton like TMS does).
 */
export async function getWarehouseCoords(): Promise<{ lat: number; lng: number } | null> {
  const [cached] = await db
    .select()
    .from(GeocodeTable)
    .where(and(eq(GeocodeTable.entityType, "warehouse"), eq(GeocodeTable.entityId, "warehouse")))
    .limit(1);
  if (cached?.lat != null && cached?.lng != null) {
    return { lat: Number(cached.lat), lng: Number(cached.lng) };
  }

  const [warehouse] = await db.select().from(WarehousesTable).limit(1);
  if (!warehouse?.warehouseAddress) return null;

  return geocodeEntity("warehouse", "warehouse", warehouse.warehouseAddress);
}
