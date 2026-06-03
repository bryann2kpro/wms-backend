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

export function rackHasCapacityForQty(
  maxCapacity: number | null,
  currentQty: number,
  incomingQty: number,
): boolean {
  if (maxCapacity == null) return true;
  if (!Number.isFinite(incomingQty) || incomingQty <= 0) return true;
  return currentQty + incomingQty <= maxCapacity;
}
