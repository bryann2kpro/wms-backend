import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { ApiKeysRepositoryClass } from './api-keys.repository.js';
import { Error } from '@/error/index.js';
import { logger } from '@/util/logger.js';

// ============================================
// ZOD SCHEMAS
// ============================================

const CreateApiKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  organizationId: z.uuid('Invalid organization ID').optional(),
  expiresAt: z.string().optional(),
});

// ============================================
// HELPERS
// ============================================

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

// ============================================
// CONTROLLER CLASS
// ============================================

export class ApiKeysControllerClass {
  constructor(private apiKeysRepository: ApiKeysRepositoryClass) {}

  /**
   * Create API Key
   * POST /api/v1/api-keys
   *
   * @description Generates a new API key, stores only the SHA-256 hash,
   * and returns the raw key once. The raw key cannot be recovered after this response.
   */
  async createApiKey(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [ApiKeysController.createApiKey] Creating API key...');

      const parseResult = CreateApiKeySchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: parseResult.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
          data: null,
        });
      }

      const { name, organizationId, expiresAt } = parseResult.data;

      // Generate a 32-byte random key as a hex string (64 chars)
      const rawKey = crypto.randomBytes(32).toString('hex');
      const keyHash = sha256(rawKey);
      const keyPrefix = rawKey.substring(0, 8);

      const apiKey = await this.apiKeysRepository.createApiKey({
        name,
        keyHash,
        keyPrefix,
        organizationId: organizationId ?? null,
        isActive: true,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });

      logger.info('✅ [ApiKeysController.createApiKey] API key created:', apiKey.id);

      // Return the raw key ONCE — it cannot be retrieved again
      return res.status(201).json({
        success: true,
        message: 'API key created. Save the rawKey now — it will not be shown again.',
        data: {
          id: apiKey.id,
          name: apiKey.name,
          keyPrefix: apiKey.keyPrefix,
          rawKey, // shown only once
          organizationId: apiKey.organizationId,
          isActive: apiKey.isActive,
          expiresAt: apiKey.expiresAt,
          createdAt: apiKey.createdAt,
        },
      });
    } catch (error) {
      logger.error('❌ [ApiKeysController.createApiKey] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /**
   * List API Keys
   * GET /api/v1/api-keys
   *
   * @description Returns all API keys (metadata only — raw key is never exposed).
   */
  async listApiKeys(req: Request, res: Response) {
    try {
      logger.info('ℹ️ [ApiKeysController.listApiKeys] Listing API keys...');

      const organizationId = req.query.organizationId as string | undefined;
      const keys = await this.apiKeysRepository.listApiKeys(organizationId);

      return res.status(200).json({
        success: true,
        message: 'API keys fetched successfully',
        data: keys.map((k) => ({
          id: k.id,
          name: k.name,
          keyPrefix: k.keyPrefix,
          organizationId: k.organizationId,
          isActive: k.isActive,
          expiresAt: k.expiresAt,
          lastUsedAt: k.lastUsedAt,
          createdAt: k.createdAt,
        })),
      });
    } catch (error) {
      logger.error('❌ [ApiKeysController.listApiKeys] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /**
   * Revoke API Key
   * DELETE /api/v1/api-keys/:id
   *
   * @description Soft-deletes a key by setting isActive = false.
   */
  async revokeApiKey(req: Request, res: Response) {
    try {
      const { id } = req.params;
      logger.info('ℹ️ [ApiKeysController.revokeApiKey] Revoking key:', id);

      const key = await this.apiKeysRepository.revokeApiKey(id);

      if (!key) {
        return res.status(404).json({
          success: false,
          message: Error.NOT_FOUND,
          data: null,
        });
      }

      logger.info('✅ [ApiKeysController.revokeApiKey] Key revoked:', id);
      return res.status(200).json({
        success: true,
        message: 'API key revoked successfully',
        data: { id: key.id, isActive: key.isActive },
      });
    } catch (error) {
      logger.error('❌ [ApiKeysController.revokeApiKey] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }
}
