/**
 * Pallet capacity for warehouse delivery vehicles.
 *
 * Layout: standard pallet footprint 4 ft × 3 ft ("Pallet 4x3").
 * Rule: no pallet stacking on warehouse delivery — only a manufacturer's own
 * pallet may stack; warehouse stacking causes item loss. Capacity is therefore
 * single-layer floor slots only (length/4 × width/3).
 */

/** Pallet slot length along the truck bed (ft). */
export const PALLET_SLOT_LENGTH_FT = 4;

/** Pallet slot width across the truck bed (ft). */
export const PALLET_SLOT_WIDTH_FT = 3;

export type PalletCapacityInput = {
  lengthFt: number;
  widthFt: number;
};

export type PalletCapacityResult = {
  /** Single-layer pallet count (warehouse delivery, no stacking). */
  count: number;
  slotsAlongLength: number;
  slotsAlongWidth: number;
};

function floorFit(container: number, unit: number): number {
  if (!Number.isFinite(container) || !Number.isFinite(unit) || unit <= 0) return 0;
  return Math.max(0, Math.floor(container / unit));
}

/**
 * Compute max pallets for warehouse delivery (no vertical stacking).
 */
export function computeWarehouseDeliveryPalletCount(
  input: PalletCapacityInput,
): PalletCapacityResult {
  const slotsAlongLength = floorFit(input.lengthFt, PALLET_SLOT_LENGTH_FT);
  const slotsAlongWidth = floorFit(input.widthFt, PALLET_SLOT_WIDTH_FT);
  return {
    count: slotsAlongLength * slotsAlongWidth,
    slotsAlongLength,
    slotsAlongWidth,
  };
}

export type PalletCountValidation = {
  /** Value to persist — explicit import value, or computed when omitted. */
  resolvedCount: number | null;
  /** Non-blocking warning when import value exceeds single-layer capacity. */
  warning?: string;
};

/**
 * Resolve pallet count from import: use explicit "Pallet 4x3" when provided,
 * otherwise derive from bed dimensions. Warn if explicit count implies stacking.
 */
export function resolveWarehouseDeliveryPalletCount(
  lengthFt: number | null,
  widthFt: number | null,
  explicitPallets: number | null,
): PalletCountValidation {
  const computed =
    lengthFt != null && widthFt != null
      ? computeWarehouseDeliveryPalletCount({ lengthFt, widthFt })
      : null;

  if (explicitPallets != null) {
    if (computed != null && explicitPallets > computed.count) {
      return {
        resolvedCount: computed.count,
        warning: `Pallet 4x3 value ${explicitPallets} exceeds single-layer capacity ${computed.count} (no warehouse stacking). Using ${computed.count}.`,
      };
    }
    return { resolvedCount: explicitPallets };
  }

  if (computed != null && computed.count > 0) {
    return { resolvedCount: computed.count };
  }

  return { resolvedCount: null };
}
