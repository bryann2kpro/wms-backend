import { describe, expect, it } from 'vitest';
import {
  computeWarehouseDeliveryPalletCount,
  resolveWarehouseDeliveryPalletCount,
} from './transport-pallet.util';

describe('computeWarehouseDeliveryPalletCount', () => {
  it('computes 5T bed as 8 single-layer pallets (17ft × 7ft)', () => {
    const result = computeWarehouseDeliveryPalletCount({ lengthFt: 17, widthFt: 7 });
    expect(result.slotsAlongLength).toBe(4);
    expect(result.slotsAlongWidth).toBe(2);
    expect(result.count).toBe(8);
  });
});

describe('resolveWarehouseDeliveryPalletCount', () => {
  it('uses computed count when explicit pallets omitted', () => {
    const { resolvedCount, warning } = resolveWarehouseDeliveryPalletCount(17, 7, null);
    expect(resolvedCount).toBe(8);
    expect(warning).toBeUndefined();
  });

  it('caps explicit count that implies stacking', () => {
    const { resolvedCount, warning } = resolveWarehouseDeliveryPalletCount(17, 7, 16);
    expect(resolvedCount).toBe(8);
    expect(warning).toContain('no warehouse stacking');
  });

  it('accepts explicit count matching single-layer capacity', () => {
    const { resolvedCount, warning } = resolveWarehouseDeliveryPalletCount(17, 7, 8);
    expect(resolvedCount).toBe(8);
    expect(warning).toBeUndefined();
  });
});
