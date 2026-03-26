import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger.js';
import { EsAdvanceNoticesTable, EsAdvanceNoticeType } from './es-advance-notice.model.js';

export class EsAdvanceNoticeRepositoryClass {
  /**
   * Find an existing advance notice by tranid.
   * Used for duplicate detection before saving.
   */
  async findByTranid(tranid: string): Promise<EsAdvanceNoticeType | null> {
    try {
      logger.info(`ℹ️ [EsAdvanceNoticeRepository.findByTranid] Checking for tranid: ${tranid}`);
      const [record] = await db
        .select()
        .from(EsAdvanceNoticesTable)
        .where(eq(EsAdvanceNoticesTable.tranid, tranid))
        .limit(1);
      return record ?? null;
    } catch (error) {
      logger.error('❌ [EsAdvanceNoticeRepository.findByTranid] Error:', error);
      throw error;
    }
  }

  /**
   * Persist an advance notice payload from NetSuite.
   * Returns the saved record for the acknowledgement response.
   */
  async saveAdvanceNotice(input: {
    tranid: string;
    apiKeyId: string;
    payload: unknown;
  }): Promise<EsAdvanceNoticeType> {
    try {
      logger.info(`ℹ️ [EsAdvanceNoticeRepository.saveAdvanceNotice] Saving advance notice for tranid: ${input.tranid}`);
      const [record] = await db
        .insert(EsAdvanceNoticesTable)
        .values({
          tranid: input.tranid,
          apiKeyId: input.apiKeyId,
          payload: input.payload,
        })
        .returning();
      logger.info(`✅ [EsAdvanceNoticeRepository.saveAdvanceNotice] Saved record id: ${record.id}`);
      return record;
    } catch (error) {
      logger.error('❌ [EsAdvanceNoticeRepository.saveAdvanceNotice] Error:', error);
      throw error;
    }
  }
}
