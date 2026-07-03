import { describe, expect, test } from 'vitest';
import { compareStorageBinCodes, parseStorageBinCode } from '@/util/storage-bin-sort';

describe('parseStorageBinCode', () => {
  test('parses A1-L1-01', () => {
    expect(parseStorageBinCode('A1-L1-01')).toEqual({
      aisleLetter: 'A',
      aisleNumber: 1,
      level: 1,
      position: 1,
      raw: 'A1-L1-01',
    });
  });

  test('returns null for invalid format', () => {
    expect(parseStorageBinCode('invalid')).toBeNull();
    expect(parseStorageBinCode('')).toBeNull();
  });
});

describe('compareStorageBinCodes', () => {
  const bins = [
    'B1-L1-01',
    'A2-L1-01',
    'A1-L2-01',
    'A1-L1-100',
    'A1-L1-02',
    'A1-L1-01',
    'A3-L1-01',
    'A1-L1-01',
  ];

  test('sorts aisle → level → position numerically', () => {
    const sorted = [...new Set(bins)].sort(compareStorageBinCodes);
    expect(sorted).toEqual([
      'A1-L1-01',
      'A1-L1-02',
      'A1-L1-100',
      'A1-L2-01',
      'A2-L1-01',
      'A3-L1-01',
      'B1-L1-01',
    ]);
  });

  test('position 02 is less than 100 (not lexical)', () => {
    expect(compareStorageBinCodes('A1-L1-02', 'A1-L1-100')).toBeLessThan(0);
    expect(compareStorageBinCodes('A1-L1-100', 'A1-L1-02')).toBeGreaterThan(0);
  });

  test('same position with different padding compares equal', () => {
    expect(compareStorageBinCodes('A1-L1-01', 'A1-L1-1')).toBe(0);
  });
});
