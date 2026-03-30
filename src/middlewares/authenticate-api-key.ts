import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { apiKeysRepository } from '@/composition-root.js';
import { ApiKeyType } from '@/features/api-keys/api-keys.model.js';
import { Error } from '@/error/index.js';
import { logger } from '@/util/logger';

// Extend Express Request to carry the resolved API key
declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKeyType;
    }
  }
}

/**
 * authenticateApiKey middleware
 *
 * Reads the `x-api-key` header, hashes it with SHA-256, and looks it up in the DB.
 * Attaches the resolved `ApiKeyType` to `req.apiKey` for downstream handlers.
 *
 * Returns 401 if:
 *   - Header is missing
 *   - Key not found or revoked (isActive = false)
 *   - Key has passed its expiresAt date
 */
const authenticateApiKey = async (req: Request, res: Response, next: NextFunction) => {
  const rawKey = req.headers['x-api-key'];
  logger.info('ℹ️ [authenticateApiKey] Raw key:' + rawKey);

  if (!rawKey || typeof rawKey !== 'string') {
    logger.warn("⚠️ [authenticateApiKey] Raw key is required");
    return res.status(401).json({
      success: false,
      message: 'x-api-key header is required'
    });
  }

  const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const apiKey = await apiKeysRepository.getApiKeyByHash(hash);

  if (!apiKey || !apiKey.isActive) {
    logger.warn("⚠️ [authenticateApiKey] Invalid or revoked API key");
    return res.status(401).json({
      success: false,
      message: 'Invalid or revoked API key',
    });
  }

  if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
    logger.warn("⚠️ [authenticateApiKey] API key has expired");
    return res.status(401).json({
      success: false,
      message: 'API key has expired',
    });
  }

  // Stamp lastUsedAt — fire-and-forget, don't block the request
  apiKeysRepository.updateLastUsed(apiKey.id);

  req.apiKey = apiKey;
  next();
};

export default authenticateApiKey;
