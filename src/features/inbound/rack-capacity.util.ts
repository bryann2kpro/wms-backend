/**
 * Rack capacity helpers for inbound putaway.
 * Uses m_racks (length/width/height/weight) and m_skus case dimensions.
 */

export type RackDimensions = {
  length?: string | null;
  width?: string | null;
  height?: string | null;
  weight?: string | null;
};

export type SkuCaseDimensions = {
  caseExtLengthMm?: string | null;
  caseExtWidthMm?: string | null;
  caseExtHeightMm?: string | null;
  caseGrossWeightKg?: string | null;
  casesPerLayer?: string | null;
  noOfLayers?: string | null;
};

function positiveNum(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function floorFit(container: number, unit: number): number {
  if (unit <= 0) return 0;
  return Math.floor(container / unit);
}

/**
 * Max cases of a SKU that fit in a rack (volume and weight limits).
 * Returns null when dimensions are insufficient to compute capacity.
 */
export function maxCasesForSkuInRack(
  rack: RackDimensions,
  sku: SkuCaseDimensions,
): number | null {
  const rackL = positiveNum(rack.length);
  const rackW = positiveNum(rack.width);
  const rackH = positiveNum(rack.height);
  const rackWeight = positiveNum(rack.weight);

  const caseL = positiveNum(sku.caseExtLengthMm);
  const caseW = positiveNum(sku.caseExtWidthMm);
  const caseH = positiveNum(sku.caseExtHeightMm);
  const caseWeight = positiveNum(sku.caseGrossWeightKg);

  let maxByVolume: number | null = null;
  if (rackL && rackW && rackH && caseL && caseW && caseH) {
    const casesPerLayer =
      positiveNum(sku.casesPerLayer) ??
      floorFit(rackL, caseL) * floorFit(rackW, caseW);
    const layers =
      positiveNum(sku.noOfLayers) ?? floorFit(rackH, caseH);
    if (casesPerLayer > 0 && layers > 0) {
      maxByVolume = casesPerLayer * layers;
    }

    const rackVol = rackL * rackW * rackH;
    const caseVol = caseL * caseW * caseH;
    const maxByTotalVolume = floorFit(rackVol, caseVol);
    if (maxByVolume != null) {
      maxByVolume = Math.min(maxByVolume, maxByTotalVolume);
    } else if (maxByTotalVolume > 0) {
      maxByVolume = maxByTotalVolume;
    }
  }

  let maxByWeight: number | null = null;
  if (rackWeight && caseWeight) {
    maxByWeight = floorFit(rackWeight, caseWeight);
  }

  if (maxByVolume != null && maxByWeight != null) {
    return Math.min(maxByVolume, maxByWeight);
  }
  return maxByVolume ?? maxByWeight;
}

export type RackOccupant = {
  quantity: number;
  sku: SkuCaseDimensions;
};

export function caseVolumeMm3(sku: SkuCaseDimensions): number | null {
  const caseL = positiveNum(sku.caseExtLengthMm);
  const caseW = positiveNum(sku.caseExtWidthMm);
  const caseH = positiveNum(sku.caseExtHeightMm);
  if (!caseL || !caseW || !caseH) return null;
  return caseL * caseW * caseH;
}

export function rackVolumeMm3(rack: RackDimensions): number | null {
  const rackL = positiveNum(rack.length);
  const rackW = positiveNum(rack.width);
  const rackH = positiveNum(rack.height);
  if (!rackL || !rackW || !rackH) return null;
  return rackL * rackW * rackH;
}

/** Sum volume (mm³) and weight (kg) used on a rack across all SKUs. */
export function computeRackUsage(occupants: RackOccupant[]): {
  usedVolumeMm3: number;
  usedWeightKg: number;
  totalCartons: number;
} {
  let usedVolumeMm3 = 0;
  let usedWeightKg = 0;
  let totalCartons = 0;

  for (const { quantity, sku } of occupants) {
    const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
    if (qty <= 0) continue;

    totalCartons += qty;
    const caseVol = caseVolumeMm3(sku);
    if (caseVol) usedVolumeMm3 += qty * caseVol;
    const caseWt = positiveNum(sku.caseGrossWeightKg);
    if (caseWt) usedWeightKg += qty * caseWt;
  }

  return { usedVolumeMm3, usedWeightKg, totalCartons };
}

export type RackSkuCapacityResult = {
  maxCapacity: number | null;
  /** Equivalent cartons of the target SKU consumed by all SKUs on the rack. */
  currentQuantity: number;
  availableCapacity: number | null;
};

/**
 * Capacity for putting away a target SKU on a rack that may already hold other SKUs.
 * Uses per-carton dimensions/weight from m_skus and stock_quant quantities on the rack.
 */
export function capacityForSkuOnRack(
  rack: RackDimensions,
  targetSku: SkuCaseDimensions,
  occupants: RackOccupant[],
): RackSkuCapacityResult {
  const maxCapacity = maxCasesForSkuInRack(rack, targetSku);
  const { usedVolumeMm3, usedWeightKg, totalCartons } = computeRackUsage(occupants);

  const rackVol = rackVolumeMm3(rack);
  const rackWt = positiveNum(rack.weight);
  const targetCaseVol = caseVolumeMm3(targetSku);
  const targetCaseWt = positiveNum(targetSku.caseGrossWeightKg);

  const canConvertUsageToTargetSku = Boolean(targetCaseVol || targetCaseWt);
  let currentQuantity: number;
  if (canConvertUsageToTargetSku) {
    let usedEquivalent = 0;
    if (targetCaseVol && usedVolumeMm3 > 0) {
      usedEquivalent = Math.max(usedEquivalent, usedVolumeMm3 / targetCaseVol);
    }
    if (targetCaseWt && usedWeightKg > 0) {
      usedEquivalent = Math.max(usedEquivalent, usedWeightKg / targetCaseWt);
    }
    currentQuantity = Math.ceil(usedEquivalent);
  } else {
    currentQuantity = totalCartons;
  }

  let availableCapacity: number | null = null;
  if (maxCapacity != null) {
    availableCapacity = Math.max(0, maxCapacity - currentQuantity);
  } else {
    const availCandidates: number[] = [];
    if (rackVol != null && targetCaseVol) {
      availCandidates.push(Math.floor((rackVol - usedVolumeMm3) / targetCaseVol));
    }
    if (rackWt != null && targetCaseWt) {
      availCandidates.push(Math.floor((rackWt - usedWeightKg) / targetCaseWt));
    }
    if (availCandidates.length > 0) {
      availableCapacity = Math.max(0, Math.min(...availCandidates));
    }
  }

  return { maxCapacity, currentQuantity, availableCapacity };
}

export function rackHasCapacityForQty(
  maxCapacity: number | null,
  currentQty: number,
  incomingQty: number,
): boolean {
  if (maxCapacity == null) return true;
  if (!Number.isFinite(incomingQty) || incomingQty <= 0) return true;
  return currentQty + incomingQty <= maxCapacity;
}

/** Whether incoming cartons of targetSku fit given all SKUs already on the rack. */
export function rackHasCapacityForIncomingSku(
  rack: RackDimensions,
  targetSku: SkuCaseDimensions,
  occupants: RackOccupant[],
  incomingQty: number,
): boolean {
  if (!Number.isFinite(incomingQty) || incomingQty <= 0) return true;
  const { availableCapacity } = capacityForSkuOnRack(rack, targetSku, occupants);
  if (availableCapacity != null) {
    return incomingQty <= availableCapacity;
  }
  // Capacity unknown — only allow putaway on empty racks.
  return computeRackUsage(occupants).totalCartons <= 0;
}
