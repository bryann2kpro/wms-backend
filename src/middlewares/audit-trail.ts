import { logger } from "../util/logger.js";
import { getUserDataByToken } from "@/features/auth/auth.repository";
import { Request } from 'express';
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
 * Middleware to assign audit trail information to an entity based on the request and action.
 * 
 * @param {AuditTrailAction} action - The action to be performed.
 * @returns {Function} - Middleware function.
 */
export const auditTrailMiddleware = (action: AuditTrailAction) => {
  return async <T extends AuditTrailType>(req: Request, res: any, next: Function): Promise<void> => {
    const authHeader = req.header('Authorization')?.split(' ')[1];
    if (!authHeader) {
      logger.error('Audit Trail: Access token is missing or invalid');
      return res.status(401).json({ message: Error.UNAUTHORIZED });
    }
    const user = await getUserDataByToken(authHeader);

    if (!user) {
      logger.error('Audit Trail: user_id could not be retrieved');
      return res.status(401).json({ message: Error.UNAUTHORIZED });
    }

    const entity: T = req.body;

    if (action === AuditTrailAction.CREATE) {
      entity.createdBy = user.userId;
      entity.updatedBy = user.userId;
    } else if (action === AuditTrailAction.UPDATE) {
      entity.updatedBy = user.userId;
      entity.updatedAt = new Date();
    }

    next(); // Pass control to the next middleware
  };
}