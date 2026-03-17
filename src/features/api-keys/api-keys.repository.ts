import { db } from '@/db/index';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/util/logger.js';
import { ApiKeysTable, ApiKeyType, ApiKeyInsertType } from './api-keys.model.js';

export class ApiKeysRepositoryClass {
  /**
   * Insert a new API key record.
   * The caller is responsible for hashing the raw key before passing keyHash.
   */
  async createApiKey(
    input: Omit<ApiKeyInsertType, 'id' | 'createdAt' | 'lastUsedAt'>,
  ): Promise<ApiKeyType> {
    try {
      logger.info('ℹ️ [ApiKeysRepository.createApiKey] Inserting new API key...');
      const [key] = await db.insert(ApiKeysTable).values(input).returning();
      logger.info('✅ [ApiKeysRepository.createApiKey] API key created:', key.id);
      return key;
    } catch (error) {
      logger.error('❌ [ApiKeysRepository.createApiKey] Error:', error);
      throw error;
    }
  }

  /**
   * Look up an API key by its SHA-256 hash.
   * Used during request authentication.
   */
  async getApiKeyByHash(hash: string): Promise<ApiKeyType | null> {
    try {
      const rows = await db
        .select()
        .from(ApiKeysTable)
        .where(eq(ApiKeysTable.keyHash, hash))
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      logger.error('❌ [ApiKeysRepository.getApiKeyByHash] Error:', error);
      return null;
    }
  }

  /**
   * List all API keys for an organization, ordered newest first.
   * Never returns the raw key — only metadata.
   */
  async listApiKeys(organizationId?: string | null): Promise<ApiKeyType[]> {
    try {
      const query = db
        .select()
        .from(ApiKeysTable)
        .orderBy(desc(ApiKeysTable.createdAt));

      if (organizationId) {
        return await db
          .select()
          .from(ApiKeysTable)
          .where(eq(ApiKeysTable.organizationId, organizationId))
          .orderBy(desc(ApiKeysTable.createdAt));
      }

      return await query;
    } catch (error) {
      logger.error('❌ [ApiKeysRepository.listApiKeys] Error:', error);
      return [];
    }
  }

  /**
   * Soft-delete a key by setting isActive = false.
   */
  async revokeApiKey(id: string): Promise<ApiKeyType | null> {
    try {
      logger.info('ℹ️ [ApiKeysRepository.revokeApiKey] Revoking key:', id);
      const [key] = await db
        .update(ApiKeysTable)
        .set({ isActive: false })
        .where(eq(ApiKeysTable.id, id))
        .returning();
      logger.info('✅ [ApiKeysRepository.revokeApiKey] Key revoked:', id);
      return key ?? null;
    } catch (error) {
      logger.error('❌ [ApiKeysRepository.revokeApiKey] Error:', error);
      return null;
    }
  }

  /**
   * Stamp the lastUsedAt timestamp on every successful authentication.
   * Fire-and-forget — errors are logged but not re-thrown.
   */
  async updateLastUsed(id: string): Promise<void> {
    try {
      await db
        .update(ApiKeysTable)
        .set({ lastUsedAt: new Date() })
        .where(eq(ApiKeysTable.id, id));
    } catch (error) {
      logger.error('❌ [ApiKeysRepository.updateLastUsed] Error:', error);
    }
  }
}
