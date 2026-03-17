import { db } from '@/db/index';
import { logger } from '@/util/logger.js';
import { EsAdvanceNoticesTable, EsAdvanceNoticeType } from './es-advance-notice.model.js';

export class EsAdvanceNoticeRepositoryClass {
  /**
   * Persist an advance notice payload from Empire Sushi.
   * Returns the saved record (id + receivedAt) for the acknowledgement response.
   */
  async saveAdvanceNotice(input: {
    apiKeyId: string;
    payload: unknown;
  }): Promise<EsAdvanceNoticeType> {
    try {
      logger.info('ℹ️ [EsAdvanceNoticeRepository.saveAdvanceNotice] Saving advance notice...');
      const [record] = await db
        .insert(EsAdvanceNoticesTable)
        .values({
          apiKeyId: input.apiKeyId,
          payload: input.payload,
        })
        .returning();
      logger.info('✅ [EsAdvanceNoticeRepository.saveAdvanceNotice] Saved:', record.id);
      return record;
    } catch (error) {
      logger.error('❌ [EsAdvanceNoticeRepository.saveAdvanceNotice] Error:', error);
      throw error;
    }
  }
}
