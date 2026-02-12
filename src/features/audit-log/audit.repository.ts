// ============================================
// FILTER TYPES
// ============================================

import { logger } from "@/util/logger";
import { PaginatedResponse, PaginationParams } from "../rbac/rbac.model";
import { AuditLogTable } from "./audit.model";
import { and, eq, gte, lte, ne } from "drizzle-orm";
import { pagination, PgQueryType } from "@/util/pagination";
import { db } from "@/db";
import { GraphQLContext } from "@/graphql/context";
import { DbTransaction } from "@/types/db-transaction";

export type AuditLogFilter = {
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
  entity?: string;
  entityId?: string;
  action?: string;
};

export type CreateAuditLogInput = {
  userId?: string | null;
  role?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  batchId?: string | null;
  oldData?: unknown;
  newData?: unknown;
  ipAddress: string;
  userAgent: string;
};

export class AuditLogRepositoryClass {
    constructor() {}

    /**
     * Get audit logs with optional filtering and pagination
     * @param filter - Filter options
     * @param paginationParams - Pagination parameters
     * @param context - GraphQL context for role-based filtering
     * @returns Paginated audit logs
     */
    async getAuditLog(
      filter: AuditLogFilter, 
      paginationParams: PaginationParams,
      context?: GraphQLContext
    ): Promise<PaginatedResponse<any>> {
      try {
        logger.info('ℹ️ [AuditLogRepository.getAuditLog] Getting audit logs...');
        logger.debug('Filter:', filter);

        const whereCondition = [];

        if (filter.dateFrom) {
          whereCondition.push(gte(AuditLogTable.createdAt, new Date(filter.dateFrom)));
        }
        if (filter.dateTo) {
          whereCondition.push(lte(AuditLogTable.createdAt, new Date(filter.dateTo)));
        }
        if (filter.userId) {
          whereCondition.push(eq(AuditLogTable.userId, filter.userId));
        }
        if (filter.entity) {
          whereCondition.push(eq(AuditLogTable.entity, filter.entity));
        }
        if (filter.entityId) {
          whereCondition.push(eq(AuditLogTable.entityId, filter.entityId));
        }
        if (filter.action) {
          whereCondition.push(eq(AuditLogTable.action, filter.action));
        }
        
        // Filter out Super Admin logs for non-Super Admin users
        if (context && !context.isSuperAdmin) {
          whereCondition.push(ne(AuditLogTable.role, 'Super Admin'));
        }
        
        const baseQuery = db
          .select()
          .from(AuditLogTable)
          .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

        const pageSize = paginationParams.pageSize || 10;
        const pageNumber = paginationParams.pageNumber || 1;
        const totalCount = (await baseQuery).length;
        const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
        const data = await paginatedQuery.query;

        logger.info('✅ [AuditLogRepository.getAuditLog] Audit logs fetched successfully');
        return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
        logger.error('❌ [AuditLogRepository.getAuditLog] Error:', error);
        throw error;
    }
    }

    /**
 * Create a new audit log entry
 * @param input - Audit log data
 * @param tx - Optional transaction 
 * @returns The created audit log entry
 */
    async createAuditLog(input: CreateAuditLogInput, tx?: DbTransaction): Promise<typeof AuditLogTable.$inferSelect> {
      try {
        logger.debug('[AuditLogRepository.createAuditLog] Creating audit log...', {
          action: input.action,
          entity: input.entity,
          entityId: input.entityId,
          batchId: input.batchId,
        });

        const [auditLog] = await (tx || db)
          .insert(AuditLogTable)
          .values({
            userId: input.userId ?? undefined,
            role: input.role ?? undefined,
            action: input.action,
            entity: input.entity,
            entityId: input.entityId ?? undefined,
            batchId: input.batchId ?? undefined,
            oldData: input.oldData,
            newData: input.newData,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
          })
          .returning();

        logger.debug('[AuditLogRepository.createAuditLog] Audit log created successfully', {
          auditLogId: auditLog.auditLogId,
        });

        return auditLog;
      } catch (error) {
        logger.error('[AuditLogRepository.createAuditLog] Error:', error);
        throw error;
      }
    }
}