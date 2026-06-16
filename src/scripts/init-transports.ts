import 'dotenv/config';

import { db } from '@/db';
import { logger } from '@/util/logger';
import { eq } from 'drizzle-orm';
import { TransportTable } from '@/features/master-data/transport.model';

/** Default organization ID used by migrations and init (single-tenant / default org). */
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

const FT_TO_MM = 304.8;

const ftToMm = (ft: number) => (ft * FT_TO_MM).toFixed(2);

/**
 * Vehicle specs sourced from "Transport Codde.XLSX".
 * BTM = unladen weight, BDM = gross vehicle weight, Payload (BG) = BDM - BTM.
 */
const TRANSPORT_SEED_DATA = [
  {
    code: '5T',
    description: 'Payload (BG): 1317.5 kg',
    minWeightKg: '3450.000',
    maxWeightKg: '5000.000',
    maxLengthMm: ftToMm(17),
    maxWidthMm: ftToMm(7),
    maxHeightMm: ftToMm(7),
    numberOfPallets: 8,
  },
  {
    code: '10T',
    description: 'Payload (BG): 12384.5 kg',
    minWeightKg: '10430.000',
    maxWeightKg: '25000.000',
    maxLengthMm: ftToMm(29),
    maxWidthMm: ftToMm(8),
    maxHeightMm: ftToMm(8),
    numberOfPallets: 16,
  },
  {
    code: '40FT-TRAILER',
    description: 'Payload (BG): 18436.5 kg',
    minWeightKg: '15310.000',
    maxWeightKg: '37000.000',
    maxLengthMm: ftToMm(41),
    maxWidthMm: ftToMm(8),
    maxHeightMm: ftToMm(8),
    numberOfPallets: 24,
  },
];

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

    await db.insert(TransportTable).values({
      ...transport,
      organizationId: DEFAULT_ORG_ID,
      createdBy: 'system',
      updatedBy: 'system',
    });
    logger.info(`✅ Created transport ${transport.code}`);
  }
}
