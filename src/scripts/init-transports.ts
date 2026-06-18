import 'dotenv/config';

import { db } from '@/db';
import { logger } from '@/util/logger';
import { eq } from 'drizzle-orm';
import { TransportTable } from '@/features/master-data/transport.model';
import {
  computeWarehouseDeliveryPalletCount,
} from '@/features/master-data/transport-pallet.util';

/** Default organization ID used by migrations and init (single-tenant / default org). */
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

const FT_TO_MM = 304.8;

const ftToMm = (ft: number) => (ft * FT_TO_MM).toFixed(2);

type TransportSeedRow = {
  code: string;
  description: string;
  minWeightKg?: string;
  maxWeightKg?: string;
  maxLengthMm?: string;
  maxWidthMm?: string;
  maxHeightMm?: string;
  /** Length/width in ft — used to derive Pallet 4x3 count when numberOfPallets omitted. */
  lengthFt?: number;
  widthFt?: number;
  heightFt?: number;
  numberOfPallets?: number;
};

function withPallet4x3Count(row: TransportSeedRow) {
  if (row.numberOfPallets != null) return row;
  if (row.lengthFt == null || row.widthFt == null) return row;
  const { count } = computeWarehouseDeliveryPalletCount({
    lengthFt: row.lengthFt,
    widthFt: row.widthFt,
  });
  return { ...row, numberOfPallets: count > 0 ? count : undefined };
}

/**
 * Vehicle specs sourced from "Transport Codde.XLSX".
 * BTM = unladen weight, BDM = gross vehicle weight, Payload (BG) = BDM - BTM.
 * Pallet 4x3 = single-layer floor slots (4 ft × 3 ft); no warehouse stacking.
 */
const TRANSPORT_SEED_DATA: TransportSeedRow[] = [
  {
    code: '3T',
    description: 'TODO: confirm BTM/BDM/dimensions from Transport Codde.XLSX',
    // Dimensions and pallet count pending user confirmation — do not guess.
  },
  {
    code: '5T',
    description: 'Payload (BG): 1317.5 kg',
    minWeightKg: '3450.000',
    maxWeightKg: '5000.000',
    lengthFt: 17,
    widthFt: 7,
    heightFt: 7,
    maxLengthMm: ftToMm(17),
    maxWidthMm: ftToMm(7),
    maxHeightMm: ftToMm(7),
  },
  {
    code: '10T',
    description: 'Payload (BG): 12384.5 kg',
    minWeightKg: '10430.000',
    maxWeightKg: '25000.000',
    lengthFt: 29,
    widthFt: 8,
    heightFt: 8,
    maxLengthMm: ftToMm(29),
    maxWidthMm: ftToMm(8),
    maxHeightMm: ftToMm(8),
  },
  {
    code: '40FT-TRAILER',
    description: 'Payload (BG): 18436.5 kg',
    minWeightKg: '15310.000',
    maxWeightKg: '37000.000',
    lengthFt: 41,
    widthFt: 8,
    heightFt: 8,
    maxLengthMm: ftToMm(41),
    maxWidthMm: ftToMm(8),
    maxHeightMm: ftToMm(8),
  },
].map(withPallet4x3Count);

export async function initTransports(): Promise<void> {
  for (const transport of TRANSPORT_SEED_DATA) {
    const existing = await db
      .select()
      .from(TransportTable)
      .where(eq(TransportTable.code, transport.code))
      .limit(1);

    if (existing.length > 0) {
      logger.info(`✓ Transport ${transport.code} already exists`);
      continue;
    }

    const { lengthFt: _lengthFt, widthFt: _widthFt, heightFt: _heightFt, ...insertRow } = transport;
    await db.insert(TransportTable).values({
      ...insertRow,
      organizationId: DEFAULT_ORG_ID,
      createdBy: 'system',
      updatedBy: 'system',
    });
    logger.info(`✅ Created transport ${transport.code}`);
  }
}
