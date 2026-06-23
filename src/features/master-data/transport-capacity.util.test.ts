import { describe, expect, it } from 'vitest';
import {
  applyCapacityTemplate,
  isSystemCapacityTemplateCode,
  parseCapacityTemplateCode,
} from './transport-capacity.util';

describe('parseCapacityTemplateCode', () => {
  it('maps parenthesized ton labels', () => {
    expect(parseCapacityTemplateCode('WTH4155 (3 TON)')).toBe('3T');
    expect(parseCapacityTemplateCode('WA9206J (3TON)')).toBe('3T');
    expect(parseCapacityTemplateCode('WA8803N (5 TON)')).toBe('5T');
    expect(parseCapacityTemplateCode('BGG6518 (1 TON)')).toBe('1T');
  });

  it('maps trailer plates to 40FT-TRAILER', () => {
    expect(parseCapacityTemplateCode('JRU5522 - TRAILER')).toBe('40FT-TRAILER');
    expect(parseCapacityTemplateCode('VAQ5522 - TRAILER')).toBe('40FT-TRAILER');
    expect(parseCapacityTemplateCode('ANL5522 (KALAI TRAILER)')).toBe('40FT-TRAILER');
    expect(parseCapacityTemplateCode('ANY5522 - KALAI TRAILER')).toBe('40FT-TRAILER');
  });

  it('returns null for unknown vehicles', () => {
    expect(parseCapacityTemplateCode('ACSAL')).toBeNull();
    expect(parseCapacityTemplateCode('CENTROLINK')).toBeNull();
  });
});

describe('isSystemCapacityTemplateCode', () => {
  it('matches exact template codes only', () => {
    expect(isSystemCapacityTemplateCode('3T')).toBe(true);
    expect(isSystemCapacityTemplateCode('WTH4155 (3 TON)')).toBe(false);
  });
});

describe('applyCapacityTemplate', () => {
  it('fills specs from 3T template for a 3-ton vehicle', () => {
    const result = applyCapacityTemplate({
      code: 'WTH4155 (3 TON)',
      description: null,
      minWeightKg: null,
      maxWeightKg: null,
      maxLengthMm: null,
      maxWidthMm: null,
      maxHeightMm: null,
      numberOfPallets: null,
    });

    expect(result.capacityClass).toBe('3T');
    expect(result.maxWeightKg).toBe('5000.000');
    expect(result.numberOfPallets).toBe(6);
    expect(result.maxLengthMm).toBe('4267.20');
  });
});
