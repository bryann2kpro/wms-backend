/**
 * POD (Proof of Delivery) Repository
 */

import { db } from '@/db';
import { PodRecordsTable, PodRecordType, PodRecordInsertType } from './pod.model';
import { desc, eq } from 'drizzle-orm';
import { logger } from '@/util/logger';

export class PodRepositoryClass {
  constructor() {}

  async createPodRecord(data: Omit<PodRecordInsertType, 'id' | 'createdAt' | 'capturedAt'>): Promise<PodRecordType> {
    try {
      logger.info('ℹ️ [PodRepository.createPodRecord] Creating POD record...');
      const [record] = await db.insert(PodRecordsTable).values({
        ...data,
        capturedAt: new Date(),
        createdAt: new Date(),
      }).returning();
      logger.info('✅ [PodRepository.createPodRecord] POD record created successfully');
      return record;
    } catch (error) {
      logger.error('❌ [PodRepository.createPodRecord] Error:', error);
      throw error;
    }
  }

  async getPodRecords(doId?: string): Promise<PodRecordType[]> {
    if (doId) {
      return db.select().from(PodRecordsTable).where(eq(PodRecordsTable.doId, doId)).orderBy(desc(PodRecordsTable.capturedAt));
    }
    return db.select().from(PodRecordsTable).orderBy(desc(PodRecordsTable.capturedAt));
  }
}
