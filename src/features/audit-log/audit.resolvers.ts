/**
 * Audit Log GraphQL Resolvers
 * 
 * @description Resolver functions for audit log operations.
 * Uses AuditLogRepository for data access.
 */

import { auditLogRepository } from '@/composition-root';
import { AuditLogFilter, AuditLogSort } from './audit.repository';
import { PaginationParams } from '../rbac/rbac.model';
import { GraphQLContext } from '@/graphql/context';

// ============================================
// HELPER FUNCTIONS
// ============================================

function transformAuditLog(auditLog: {
  auditLogId: string | number;
  userId: string | null;
  userName: string | null;
  role: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  oldData: unknown;
  newData: unknown;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
}) {
  return {
    auditLogId: String(auditLog.auditLogId),
    userId: auditLog.userId,
    userName: auditLog.userName,
    role: auditLog.role,
    action: auditLog.action,
    entity: auditLog.entity,
    entityId: auditLog.entityId,
    oldData: auditLog.oldData,
    newData: auditLog.newData,
    ipAddress: auditLog.ipAddress,
    userAgent: auditLog.userAgent,
    createdAt: auditLog.createdAt instanceof Date ? auditLog.createdAt.toISOString() : auditLog.createdAt,
  };
}

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  Query: {
    auditLogs: async (_: unknown, args: {
      filter?: AuditLogFilter;
      sort?: AuditLogSort;
      pageSize?: number;
      pageNumber?: number;
    }, context: GraphQLContext) => {
      const filter: AuditLogFilter = args.filter || {};
      const sort: AuditLogSort | undefined = args.sort;
      const paginationParams: PaginationParams = {
        pageSize: args.pageSize || 10,
        pageNumber: args.pageNumber || 1,
      };
      const result = await auditLogRepository.getAuditLog(filter, paginationParams, context, sort);

      return {
        query: result.query.map(transformAuditLog),
        pagination: result.pagination,
      };
    },
    auditLogActions: async (_: unknown, __: unknown, context: GraphQLContext) => {
      return await auditLogRepository.getDistinctActions(context);
    },
    auditLogEntities: async (_: unknown, __: unknown, context: GraphQLContext) => {
      return await auditLogRepository.getDistinctEntities(context);
    },
  },
};