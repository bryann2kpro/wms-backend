import 'dotenv/config';

import { db } from '@/db';
import { logger } from '@/util/logger';
import { eq } from 'drizzle-orm';
import { TransportTable } from '@/features/master-data/transport.model';
import { getTransportTemplateSeedRows } from '@/features/master-data/transport-capacity.util';

/** Default organization ID used by migrations and init (system tonnage templates). */
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

const TRANSPORT_SEED_DATA = getTransportTemplateSeedRows();

export async function initTransports(): Promise<void> {
  logger.info('ℹ️ [initTransports] Seeding system tonnage templates (1T, 3T, …)');

  for (const transport of TRANSPORT_SEED_DATA) {
    const existing = await db
      .select()
      .from(TransportTable)
      .where(eq(TransportTable.code, transport.code))
      .limit(1);

    if (existing.length > 0) {
      logger.info(`✓ Transport template ${transport.code} already exists`);
      continue;
    }

    const { lengthFt: _lengthFt, widthFt: _widthFt, heightFt: _heightFt, ...insertRow } = transport;
    await db.insert(TransportTable).values({
      ...insertRow,
      organizationId: DEFAULT_ORG_ID,
      createdBy: 'system',
      updatedBy: 'system',
    });
    logger.info(`✅ Created transport template ${transport.code}`);
  }
}
