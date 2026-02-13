/**
 * Audit Log GraphQL Resolvers
 * 
 * @description Resolver functions for audit log operations.
 * Uses AuditLogRepository for data access.
 */

import { auditLogRepository } from '@/composition-root';
import { AuditLogFilter } from './audit.repository';
import { PaginationParams } from '../rbac/rbac.model';
import { GraphQLContext } from '@/graphql/context';

// ============================================
// HELPER FUNCTIONS
// ============================================

function transformAuditLog(auditLog: {
  auditLogId: string;
  userId: string;
  role: string | null;
  action: string;
  entity: string;
  entityId: string;
  oldData: unknown;
  newData: unknown;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
}) {
  return {
    auditLogId: auditLog.auditLogId,
    userId: auditLog.userId,
    role: auditLog.role,
    action: auditLog.action,
    entity: auditLog.entity,
    entityId: auditLog.entityId,
    oldData: auditLog.oldData,
    newData: auditLog.newData,
    ipAddress: auditLog.ipAddress,
    userAgent: auditLog.userAgent,
    createdAt: auditLog.createdAt.toISOString(),
  };
}

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  Query: {
    auditLogs: async (_: unknown, args: {
      filter?: AuditLogFilter;
      pageSize?: number;
      pageNumber?: number;
    }, context: GraphQLContext) => {
      const filter: AuditLogFilter = args.filter || {};
      const paginationParams: PaginationParams = {
        pageSize: args.pageSize || 10,
        pageNumber: args.pageNumber || 1,
      };
      const result = await auditLogRepository.getAuditLog(filter, paginationParams, context);

      return {
        query: result.query.map(transformAuditLog),
        pagination: result.pagination,
      };
    },
  },
};