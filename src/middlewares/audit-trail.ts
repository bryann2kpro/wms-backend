import { logger } from "../util/logger.js";
import { authRepository as defaultAuthRepository } from "@/composition-root.js";
import { AuthRepositoryClass } from "@/features/auth/auth.repository.js";
import { Request, Response, NextFunction } from 'express';
import { Error } from '../error/index.js';

interface AuditTrailType {
  createdBy?: string;
  updatedBy?: string;
  updatedAt?: Date;
}

export enum AuditTrailAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE'
}

/**
 * Factory to create audit trail middleware with injected dependencies.
 * Supports dependency injection for testing while providing a convenient default.
 * 
 * @param authRepository - Optional repository instance (defaults to singleton from composition root)
 * @returns Middleware factory function
 */
export const createAuditTrailMiddleware = (
  authRepository: AuthRepositoryClass = defaultAuthRepository
) => {
  /**
   * Middleware to assign audit trail information to an entity based on the request and action.
   * 
   * @param {AuditTrailAction} action - The action to be performed.
   * @returns {Function} - Middleware function.
   */
  return (action: AuditTrailAction) => {
    return async <T extends AuditTrailType>(
      req: Request, 
      res: Response, 
      next: NextFunction
    ): Promise<void> => {
      const authHeader = req.header('Authorization')?.split(' ')[1];
      if (!authHeader) {
        logger.error('Audit Trail: Access token is missing or invalid');
        res.status(401).json({ message: Error.UNAUTHORIZED });
        return;
      }

      const user = await authRepository.getUserDataByToken(authHeader);

      if (!user) {
        logger.error('Audit Trail: user_id could not be retrieved');
        res.status(401).json({ message: Error.UNAUTHORIZED });
        return;
      }

      const entity: T = req.body;

      if (action === AuditTrailAction.CREATE) {
        entity.createdBy = user.id;
        entity.updatedBy = user.id;
      } else if (action === AuditTrailAction.UPDATE) {
        entity.updatedBy = user.id;
        entity.updatedAt = new Date();
      }

      next();
    };
  };
};

// Pre-configured middleware using the default repository from composition root
// Use this for convenience in routes
export const auditTrailMiddleware = createAuditTrailMiddleware();