import { eq, isNull } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger.js';
import { EsAdvanceNoticesTable, EsAdvanceNoticeType, EsItemReceiptsTable } from './es.model.js';
import { Transaction } from 'ioredis/built/transaction.js';
import { DbTransaction } from '@/types/db-transaction.js';

export class EsRepositoryClass {
  /**
   * Find an advance notice by its record id.
   * Used when createInbound receives advanceNoticeId from the UI.
   */
  async findById(id: string): Promise<EsAdvanceNoticeType | null> {
    try {
      logger.info(`ℹ️ [EsAdvanceNoticeRepository.findById] Fetching ASN by id: ${id}`);
      const [record] = await db
        .select()
        .from(EsAdvanceNoticesTable)
        .where(eq(EsAdvanceNoticesTable.id, id))
        .limit(1);
      return record ?? null;
    } catch (error) {
      logger.error('❌ [EsAdvanceNoticeRepository.findById] Error:', error);
      throw error;
    }
  }

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
   * Find all advance notices not yet linked to a GRN.
   * Used to populate the ASN dropdown when creating a new GRN.
   */
  async findPending(): Promise<EsAdvanceNoticeType[]> {
    try {
      logger.info('ℹ️ [EsAdvanceNoticeRepository.findPending] Fetching pending advance notices');
      return await db
        .select()
        .from(EsAdvanceNoticesTable)
        .where(isNull(EsAdvanceNoticesTable.linkedGrnId))
        .orderBy(EsAdvanceNoticesTable.receivedAt);
    } catch (error) {
      logger.error('❌ [EsAdvanceNoticeRepository.findPending] Error:', error);
      throw error;
    }
  }

  /**
   * Mark an advance notice as linked to a GRN.
   * Called within the createInbound transaction after the GRN is created.
   */
  async markLinked(id: string, grnId: string): Promise<void> {
    try {
      logger.info(`ℹ️ [EsAdvanceNoticeRepository.markLinked] Linking ASN ${id} to GRN ${grnId}`);
      await db
        .update(EsAdvanceNoticesTable)
        .set({ linkedGrnId: grnId })
        .where(eq(EsAdvanceNoticesTable.id, id));
    } catch (error) {
      logger.error('❌ [EsAdvanceNoticeRepository.markLinked] Error:', error);
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

  async saveItemReceipt(poNumber: string, esAdvanceNoticeId: string, payload: unknown, nsResponse: unknown, tx?: DbTransaction): Promise<void> {
    try {

      const client = tx ?? db;

      logger.info(`ℹ️ [EsAdvanceNoticeRepository.saveItemReceipt] Saving item receipt for esAdvanceNoticeId: ${esAdvanceNoticeId}`);
      const [record] = await client.insert(EsItemReceiptsTable).values({ poNumber, esAdvanceNoticeId, payload, nsResponse }).returning();
      logger.info(`✅ [EsAdvanceNoticeRepository.saveItemReceipt] Saved record id: ${record.id}`);
    } catch (error) {
      logger.error('❌ [EsAdvanceNoticeRepository.saveItemReceipt] Error:', error);
      throw error;
    }
  }

  async getItemReceipt(poNumber: string): Promise<any | null> {
    try {
      logger.info(`ℹ️ [EsAdvanceNoticeRepository.getItemReceipt] Fetching item receipt by poNumber: ${poNumber}`);
      const [record] = await db
        .select()
        .from(EsItemReceiptsTable)
        .leftJoin(EsAdvanceNoticesTable, eq(EsItemReceiptsTable.esAdvanceNoticeId, EsAdvanceNoticesTable.id))
        .where(eq(EsAdvanceNoticesTable.tranid, poNumber))
        .limit(1);
      logger.info(`✅ [EsAdvanceNoticeRepository.getItemReceipt] Fetched record successfully!`);
      return record ?? null;
    } catch (error) {
      logger.error('❌ [EsAdvanceNoticeRepository.getItemReceipt] Error:', error);
      throw error;
    }
  }

}
