/**
 * Tonnage templates (1T, 3T, …) and mapping from vehicle codes like "WTH4155 (3 TON)".
 * Specs sourced from Transport Codde.XLSX (authoritative).
 */

import { computeWarehouseDeliveryPalletCount } from './transport-pallet.util';

const FT_TO_MM = 304.8;
const ftToMm = (ft: number) => (ft * FT_TO_MM).toFixed(2);

export type TransportCapacityTemplate = {
  code: string;
  description: string;
  minWeightKg: string;
  maxWeightKg: string;
  maxLengthMm: string;
  maxWidthMm: string;
  maxHeightMm: string;
  numberOfPallets: number;
};

type TemplateSeed = {
  code: string;
  description: string;
  minWeightKg: string;
  maxWeightKg: string;
  lengthFt: number;
  widthFt: number;
  heightFt: number;
  numberOfPallets: number;
};

const TEMPLATE_SEED: TemplateSeed[] = [
  { code: '1T', description: 'Payload (BG): 1431 kg', minWeightKg: '2010.000', maxWeightKg: '3600.000', lengthFt: 10, widthFt: 6, heightFt: 6, numberOfPallets: 4 },
  { code: '3T', description: 'Payload (BG): 1593 kg', minWeightKg: '3230.000', maxWeightKg: '5000.000', lengthFt: 14, widthFt: 7, heightFt: 7, numberOfPallets: 6 },
  { code: '5T', description: 'Payload (BG): 1449 kg', minWeightKg: '3390.000', maxWeightKg: '5000.000', lengthFt: 17, widthFt: 7, heightFt: 7, numberOfPallets: 8 },
  { code: '10T', description: 'Payload (BG): 13113 kg', minWeightKg: '10430.000', maxWeightKg: '25000.000', lengthFt: 29, widthFt: 8, heightFt: 8, numberOfPallets: 16 },
  { code: '40FT-TRAILER', description: 'Payload (BG): 19521 kg', minWeightKg: '15310.000', maxWeightKg: '37000.000', lengthFt: 41, widthFt: 8, heightFt: 8, numberOfPallets: 24 },
];

export const TRANSPORT_CAPACITY_TEMPLATES: Record<string, TransportCapacityTemplate> =
  Object.fromEntries(
    TEMPLATE_SEED.map((row) => [
      row.code,
      {
        code: row.code,
        description: row.description,
        minWeightKg: row.minWeightKg,
        maxWeightKg: row.maxWeightKg,
        maxLengthMm: ftToMm(row.lengthFt),
        maxWidthMm: ftToMm(row.widthFt),
        maxHeightMm: ftToMm(row.heightFt),
        numberOfPallets: row.numberOfPallets,
      },
    ]),
  );

/** Seed rows for init-transports (includes ft fields for pallet util). */
export function getTransportTemplateSeedRows() {
  return TEMPLATE_SEED.map((row) => {
    const { count } = computeWarehouseDeliveryPalletCount({
      lengthFt: row.lengthFt,
      widthFt: row.widthFt,
    });
    return {
      code: row.code,
      description: row.description,
      minWeightKg: row.minWeightKg,
      maxWeightKg: row.maxWeightKg,
      maxLengthMm: ftToMm(row.lengthFt),
      maxWidthMm: ftToMm(row.widthFt),
      maxHeightMm: ftToMm(row.heightFt),
      lengthFt: row.lengthFt,
      widthFt: row.widthFt,
      heightFt: row.heightFt,
      numberOfPallets: row.numberOfPallets > 0 ? row.numberOfPallets : (count > 0 ? count : undefined),
    };
  });
}

const SYSTEM_TEMPLATE_CODES = new Set(Object.keys(TRANSPORT_CAPACITY_TEMPLATES));

/** True when code is exactly a system tonnage template (1T, 3T, …), not a vehicle plate. */
export function isSystemCapacityTemplateCode(code: string): boolean {
  return SYSTEM_TEMPLATE_CODES.has(code.trim().toUpperCase());
}

/**
 * Derive template code from a vehicle code / label.
 * e.g. "WTH4155 (3 TON)" → "3T", "JRU5522 - TRAILER" → "40FT-TRAILER"
 */
export function parseCapacityTemplateCode(code: string): string | null {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const tonMatch = trimmed.match(/\(\s*(\d+)\s*TON\s*\)/i);
  if (tonMatch) {
    const key = `${tonMatch[1]}T`;
    return TRANSPORT_CAPACITY_TEMPLATES[key] ? key : null;
  }

  if (/\bTRAILER\b/i.test(trimmed)) {
    return '40FT-TRAILER';
  }

  const upper = trimmed.toUpperCase();
  if (TRANSPORT_CAPACITY_TEMPLATES[upper]) return upper;

  return null;
}

function isUnsetNumeric(value: string | null | undefined): boolean {
  if (value == null || value === '') return true;
  const n = Number(value);
  return Number.isNaN(n) || n === 0;
}

export type TransportSpecFields = {
  code: string;
  description?: string | null;
  minLengthMm?: string | null;
  minWidthMm?: string | null;
  minHeightMm?: string | null;
  minWeightKg?: string | null;
  maxLengthMm?: string | null;
  maxWidthMm?: string | null;
  maxHeightMm?: string | null;
  maxWeightKg?: string | null;
  numberOfPallets?: number | null;
};

/** Fill missing dimensional/weight fields from the tonnage template implied by code. */
export function applyCapacityTemplate<T extends TransportSpecFields>(
  record: T,
): T & { capacityClass: string | null } {
  const capacityClass = parseCapacityTemplateCode(record.code);
  if (!capacityClass) {
    return { ...record, capacityClass: null };
  }

  const template = TRANSPORT_CAPACITY_TEMPLATES[capacityClass];
  if (!template) {
    return { ...record, capacityClass };
  }

  return {
    ...record,
    capacityClass,
    description: record.description?.trim() ? record.description : template.description,
    minWeightKg: isUnsetNumeric(record.minWeightKg) ? template.minWeightKg : record.minWeightKg,
    maxWeightKg: isUnsetNumeric(record.maxWeightKg) ? template.maxWeightKg : record.maxWeightKg,
    maxLengthMm: isUnsetNumeric(record.maxLengthMm) ? template.maxLengthMm : record.maxLengthMm,
    maxWidthMm: isUnsetNumeric(record.maxWidthMm) ? template.maxWidthMm : record.maxWidthMm,
    maxHeightMm: isUnsetNumeric(record.maxHeightMm) ? template.maxHeightMm : record.maxHeightMm,
    numberOfPallets: record.numberOfPallets ?? template.numberOfPallets,
  };
}

/** Apply template defaults when creating/updating a vehicle record. */
export function withCapacityTemplateDefaults<T extends TransportSpecFields>(input: T): T {
  const { capacityClass: _c, ...merged } = applyCapacityTemplate(input);
  return merged;
}
