// ============================================
// FILTER TYPES
// ============================================

import { logger } from "@/util/logger";
import { PaginatedResponse, PaginationParams } from "../rbac/rbac.model";
import { AuditLogTable } from "./audit.model";
import { and, eq, gte, lte, ne, asc, desc, SQL, sql } from "drizzle-orm";
import { pagination, PgQueryType } from "@/util/pagination";
import { db } from "@/db";
import { GraphQLContext } from "@/graphql/context";
import { DbTransaction } from "@/types/db-transaction";
import { UsersTable } from "../auth/auth.model";

export type AuditLogFilter = {
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
  entity?: string;
  entityId?: string;
  action?: string;
};

export type AuditLogSort = {
  field?: 'CREATED_AT' | 'ACTION' | 'ENTITY' | 'USER_NAME';
  direction?: 'ASC' | 'DESC';
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
     * Get audit logs with optional filtering, sorting, and pagination
     * @param filter - Filter options
     * @param paginationParams - Pagination parameters
     * @param context - GraphQL context for role-based filtering
     * @param sort - Sort options
     * @returns Paginated audit logs
     */
    async getAuditLog(
      filter: AuditLogFilter, 
      paginationParams: PaginationParams,
      context?: GraphQLContext,
      sort?: AuditLogSort
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
        
        // Build ORDER BY clause
        const sortField = sort?.field || 'CREATED_AT';
        const sortDirection = sort?.direction === 'ASC' ? asc : desc;
        
        let orderByClause: SQL;
        if (sortField === 'CREATED_AT') {
          orderByClause = sortDirection(AuditLogTable.createdAt);
        } else if (sortField === 'ACTION') {
          orderByClause = sortDirection(AuditLogTable.action);
        } else if (sortField === 'ENTITY') {
          orderByClause = sortDirection(AuditLogTable.entity);
        } else if (sortField === 'USER_NAME') {
          orderByClause = sortDirection(UsersTable.displayName);
        } else {
          // Default to CREATED_AT DESC
          orderByClause = desc(AuditLogTable.createdAt);
        }
        
        const baseQuery = db
          .select({
            auditLogId: AuditLogTable.auditLogId,
            userId: AuditLogTable.userId,
            role: AuditLogTable.role,
            action: AuditLogTable.action,
            entity: AuditLogTable.entity,
            entityId: AuditLogTable.entityId,
            batchId: AuditLogTable.batchId,
            oldData: AuditLogTable.oldData,
            newData: AuditLogTable.newData,
            ipAddress: AuditLogTable.ipAddress,
            userAgent: AuditLogTable.userAgent,
            createdAt: AuditLogTable.createdAt,
            userName: UsersTable.displayName,
          })
          .from(AuditLogTable)
          .leftJoin(UsersTable, eq(AuditLogTable.userId, UsersTable.id))
          .where(whereCondition.length > 0 ? and(...whereCondition) : undefined)
          .orderBy(orderByClause);

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
     * Get distinct audit log actions
     * @param context - GraphQL context for role-based filtering
     * @returns Array of distinct action strings
     */
    async getDistinctActions(context?: GraphQLContext): Promise<string[]> {
      try {
        logger.info('ℹ️ [AuditLogRepository.getDistinctActions] Getting distinct actions...');

        const whereCondition = [];
        
        // Filter out Super Admin logs for non-Super Admin users
        if (context && !context.isSuperAdmin) {
          whereCondition.push(ne(AuditLogTable.role, 'Super Admin'));
        }

        const results = await db
          .select({ action: AuditLogTable.action })
          .from(AuditLogTable)
          .where(whereCondition.length > 0 ? and(...whereCondition) : undefined)
          .groupBy(AuditLogTable.action)
          .orderBy(asc(AuditLogTable.action));

        const actions = results.map(r => r.action).filter((action): action is string => action !== null);

        logger.info('✅ [AuditLogRepository.getDistinctActions] Distinct actions fetched successfully');
        return actions;
      } catch (error) {
        logger.error('❌ [AuditLogRepository.getDistinctActions] Error:', error);
        throw error;
      }
    }

    /**
     * Get distinct audit log entities
     * @param context - GraphQL context for role-based filtering
     * @returns Array of distinct entity strings
     */
    async getDistinctEntities(context?: GraphQLContext): Promise<string[]> {
      try {
        logger.info('ℹ️ [AuditLogRepository.getDistinctEntities] Getting distinct entities...');

        const whereCondition = [];
        
        // Filter out Super Admin logs for non-Super Admin users
        if (context && !context.isSuperAdmin) {
          whereCondition.push(ne(AuditLogTable.role, 'Super Admin'));
        }

        const results = await db
          .select({ entity: AuditLogTable.entity })
          .from(AuditLogTable)
          .where(whereCondition.length > 0 ? and(...whereCondition) : undefined)
          .groupBy(AuditLogTable.entity)
          .orderBy(asc(AuditLogTable.entity));

        const entities = results.map(r => r.entity).filter((entity): entity is string => entity !== null);

        logger.info('✅ [AuditLogRepository.getDistinctEntities] Distinct entities fetched successfully');
        return entities;
      } catch (error) {
        logger.error('❌ [AuditLogRepository.getDistinctEntities] Error:', error);
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